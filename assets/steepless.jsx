import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

var Steepless = {
  directionsService: new google.maps.DirectionsService(),
  directionsRenderer: new google.maps.DirectionsRenderer(),
  elevationService: new google.maps.ElevationService(),
  longestDistance: 0,
  highestElevation: 0,
  lowestElevation: Infinity,
  chartWidth: 400,
  chartBarWidth: 2,
};

const App = () => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [routes, setRoutes] = useState(null);
  const [distanceUnit, setDistanceUnit] = useState(
    localStorage['steepless:distanceUnit'] || 'km',
  );
  const [heightUnit, setHeightUnit] = useState(
    localStorage['steepless:heightUnit'] || 'm',
  );
  const [travelMode, setTravelMode] = useState('walking');
  const [rerender, setRerender] = useState(false);
  // const [elevationFetched, setElevationFetched] = useState(false);

  const hashChange = () => {
    const hash = location.hash.slice(1);
    if (!hash) return;

    const locations = hash.split('/');
    const travelMode = decodeURIComponent(locations[0]);
    const origin = decodeURIComponent(locations[1]);
    const destination = decodeURIComponent(locations[2]);

    setTravelMode(travelMode);
    setStart(origin);
    setEnd(destination);
  };
  useEffect(() => {
    hashChange();
    window.addEventListener('hashchange', hashChange);
  }, []);

  const getRoutes = () => {
    console.log(`Directions: ${start} ➡️ ${end}`);
    Steepless.directionsService.route(
      {
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode[travelMode.toUpperCase()],
        provideRouteAlternatives: true,
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
          const { routes } = response;
          let longestDistance = 0;
          routes.forEach((route) => {
            const distance = route.legs[0].distance.value;
            if (distance > longestDistance) longestDistance = distance;
          });
          Steepless.longestDistance = longestDistance;
          setRoutes(
            routes.map((route, i) => ({
              route: route,
              selected: i === 0,
            })),
          );

          Steepless.directionsRenderer.setDirections(response);

          // getElevations();
        } else {
          setRoutes([]);
        }
      },
    );
  };
  useEffect(() => {
    if (start && end && start !== end) getRoutes();
  }, [start, end]);

  const getElevations = () => {
    console.log(`Elevations: ${start} ➡️ ${end}`);
    const elevationCalls = routes.map((data) => {
      return new Promise((resolve, reject) => {
        const { route } = data;
        const path = route.overview_path;
        const distance = route.legs[0].distance.value;
        const samples = Math.round(
          (distance / Steepless.longestDistance) *
            (Steepless.chartWidth / Steepless.chartBarWidth),
        );
        Steepless.elevationService.getElevationAlongPath(
          {
            path,
            samples,
          },
          (result, status) => {
            if (status === google.maps.ElevationStatus.OK) {
              resolve({
                data,
                elevations: result,
              });
            } else {
              reject(status);
            }
          },
        );
      });
    });

    Promise.all(elevationCalls)
      .then((results) => {
        let highestElevation = 0;
        let lowestElevation = Infinity;

        results.forEach((result) => {
          const { elevations } = result;
          let prevElevation = elevations[0].elevation;
          let rise = 0;
          let drop = 0;

          elevations.forEach(({ elevation }) => {
            if (elevation > prevElevation) rise += elevation - prevElevation;
            if (elevation < prevElevation) drop += prevElevation - elevation;
            prevElevation = elevation;

            if (elevation > highestElevation) highestElevation = elevation;
            if (elevation < lowestElevation) lowestElevation = elevation;
          });

          result.data.stats = {
            rise: rise,
            drop: drop,
          };
          result.data.elevations = elevations;
        });

        Steepless.highestElevation = highestElevation;
        Steepless.lowestElevation = lowestElevation;
        // setElevationFetched(Date.now());
        setRerender(Date.now());
      })
      .catch((err) => {
        console.error(err);
      });
  };
  useEffect(() => {
    if (routes?.length) getElevations();
  }, [routes]);

  useEffect(() => {
    localStorage['steepless:distanceUnit'] = distanceUnit;
    localStorage['steepless:heightUnit'] = heightUnit;
  }, [distanceUnit, heightUnit]);

  const handleRouteClick = (index) => {
    const newRoutes = routes.map((d, i) => {
      d.selected = index === i;
      return d;
    });
    // setRoutes(newRoutes);
    setRerender(Date.now());

    Steepless.directionsRenderer.setRouteIndex(index);
  };

  const units = {
    distance: distanceUnit,
    height: heightUnit,
  };

  return (
    <div>
      <Map />
      <div id="sidebar">
        <header>
          <h1>
            <Icon type="mountains" width="24" height="24"></Icon> Steepless
          </h1>
        </header>
        <RouteForm
          start={start}
          end={end}
          units={units}
          travelMode={travelMode}
          onUnitChange={(units) => {
            if (units.distance) setDistanceUnit(units.distance);
            if (units.height) setHeightUnit(units.height);
          }}
          onTravelModeChange={setTravelMode}
        />
        <RouteList
          data={routes}
          travelMode={travelMode}
          units={units}
          onRouteClick={handleRouteClick}
        />
      </div>
    </div>
  );
};

const Icon = ({ type, ...props }) => (
  <svg
    className="icon"
    dangerouslySetInnerHTML={{
      __html: '<use xlink:href="assets/icons.svg#icon-' + type + '"></use>',
    }}
    {...props}
  />
);

const pinpointMarker = new google.maps.Marker({
  visible: false,
  clickable: false,
  zIndex: 1000,
});

const Map = () => {
  const mapRef = useRef();
  useEffect(() => {
    const map = new google.maps.Map(mapRef.current, {
      center: new google.maps.LatLng(37.7577, -122.4376),
      zoom: 12,
      disableDefaultUI: true,
      mapId: '4e570dd5e962cb58',
    });

    pinpointMarker.setMap(map);

    Steepless.directionsRenderer.setMap(map);
  }, []);

  return <div ref={mapRef} id="map-canvas" />;
};
Map.showPinpointMarker = (location) => {
  pinpointMarker.setPosition(location);
  pinpointMarker.setVisible(true);
};
Map.hidePinpointMarker = () => {
  pinpointMarker.setVisible(false);
};

const Chart = ({
  width,
  height,
  data,
  domain,
  onBarMouseEnter = () => {},
  onBarMouseLeave = () => {},
}) => (
  <div
    className="chart"
    style={{
      width,
      height: data ? height : 0,
    }}
  >
    {(data || []).map((d, i) => (
      <div
        key={`${i}-${d.value}`}
        style={{
          borderBottomWidth: (height * d.value) / domain[1],
        }}
        onMouseEnter={() => {
          onBarMouseEnter(i);
        }}
        onMouseLeave={() => {
          onBarMouseLeave();
        }}
      >
        <span>{d.title}</span>
      </div>
    ))}
  </div>
);

const RouteForm = ({
  units,
  start,
  end,
  travelMode,
  onUnitChange = () => {},
}) => {
  const travelModeRef = useRef();
  const startRef = useRef();
  const endRef = useRef();
  const distanceSelectRef = useRef();
  const heightSelectRef = useRef();

  useEffect(() => {
    const startVal = startRef.current.value.trim();
    const endVal = endRef.current.value.trim();

    if (startVal && endVal) {
      if (start) startRef.current.value = start;
      if (end) endRef.current.value = end;
    }

    new google.maps.places.Autocomplete(startRef.current);
    new google.maps.places.Autocomplete(endRef.current);
  }, []);

  useEffect(() => {
    if (travelMode) travelModeRef.current.value = travelMode;
    if (start) startRef.current.value = start;
    if (end) endRef.current.value = end;
  }, [travelMode, start, end]);

  const updateLocationHash = (_travelMode, _start, _end) => {
    if (!_travelMode) _travelMode = travelMode;
    if (!_start) _start = start;
    if (!_end) _end = end;
    if (!_start || !_end) return;
    location.hash = `${_travelMode}/${encodeURIComponent(
      _start,
    )}/${encodeURIComponent(_end)}`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateLocationHash(
      travelModeRef.current.value,
      startRef.current.value.trim(),
      endRef.current.value.trim(),
    );
  };

  const handleTravelModeChange = () => {
    updateLocationHash(travelModeRef.current.value);
  };

  const handleFlip = (e) => {
    e.preventDefault();
    updateLocationHash(
      null,
      endRef.current.value.trim(),
      startRef.current.value.trim(),
    );
  };

  const handleDistanceChange = () => {
    onUnitChange({
      distance: distanceSelectRef.current.value,
    });
  };

  const handleHeightChange = () => {
    onUnitChange({
      height: heightSelectRef.current.value,
    });
  };

  return (
    <form id="directions-form" onSubmit={handleSubmit}>
      <div class="form-fields">
        <div className="field-section">
          <label>
            <select ref={travelModeRef} onChange={handleTravelModeChange}>
              <option value="walking">Walking</option>
              <option value="bicycling">Bicycling</option>
              <option value="driving">Driving</option>
            </select>{' '}
            from
          </label>
          <input
            ref={startRef}
            id="directions-start"
            placeholder="Start"
            required
          />
        </div>
        <a
          href="#"
          id="flip-direction"
          onClick={handleFlip}
          title="Flip origin and destination"
          tabIndex="-1"
        >
          <Icon type="arrow-right" width="14" height="14"></Icon>
        </a>
        <div className="field-section">
          <label htmlFor="directions-end">To</label>
          <input
            ref={endRef}
            id="directions-end"
            placeholder="Destination"
            required
          />
        </div>
      </div>
      <div className="form-footer">
        <div className="options">
          <Icon type="widget" width="20" height="20" title="Settings"></Icon>
          <span>
            <label>
              Distance&nbsp;
              <select
                ref={distanceSelectRef}
                defaultValue={units.distance}
                onChange={handleDistanceChange}
              >
                <option value="km">km</option>
                <option value="miles">miles</option>
              </select>
            </label>
            &nbsp;
            <label>
              Height&nbsp;
              <select
                ref={heightSelectRef}
                defaultValue={units.height}
                onChange={handleHeightChange}
              >
                <option value="m">m</option>
                <option value="ft">ft</option>
              </select>
            </label>
          </span>
        </div>
        <button>Go</button>
      </div>
    </form>
  );
};

const RouteList = ({
  data,
  units,
  travelMode,
  onRouteClick = () => {},
  onSetPinpoint = () => {},
}) => {
  if (data?.length) {
    return (
      <div id="routes-container">
        <ul id="routes-list">
          {data.map((d, i) => (
            <li
              key={`${i}${d.route.bounds.toString()}`}
              className={d.selected ? 'selected' : ''}
              onClick={() => onRouteClick(i)}
            >
              <Route
                data={d}
                units={units}
                travelMode={travelMode}
                onSetPinpoint={(data) => onSetPinpoint(data)}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!!data) {
    return (
      <div id="routes-container">
        <p>Oops, there are no routes found.</p>
      </div>
    );
  }

  return (
    <div id="routes-container">
      <p>Begin by entering the Start and Destination locations above.</p>
      <p>
        Try an example:{' '}
        <a href="#walking/Chinatown, SF/Twin Peaks, SF">
          Walking from Chinatown to Twin Peaks
        </a>
      </p>
    </div>
  );
};

const iconMap = {
  walking: 'pedestrian',
  bicycling: 'bicycle',
  driving: 'car-side',
};

const Route = ({ data, units, travelMode }) => {
  const { route, stats } = data;
  const leg = route.legs[0];
  const distanceVal = leg.distance.value;
  const width =
    (Math.ceil(
      (distanceVal / Steepless.longestDistance) * Steepless.chartWidth,
    ) /
      Steepless.chartWidth) *
    100;
  const domain = [0, Steepless.highestElevation];

  const iconType = iconMap[travelMode];

  const height = Math.round(
    (Steepless.highestElevation - Steepless.lowestElevation) / 2,
  );

  let rise = null;
  let drop = null;
  const heightUnit = units.height;

  if (stats) {
    const statsRise = stats.rise;
    const statsDrop = stats.drop;
    rise =
      Math.round(heightUnit === 'm' ? statsRise : statsRise * 3.28084) +
      ' ' +
      heightUnit;
    drop =
      Math.round(heightUnit === 'm' ? statsDrop : statsDrop * 3.28084) +
      ' ' +
      heightUnit;
  }

  const distanceUnit = units.distance;
  const distance =
    (distanceUnit === 'km'
      ? distanceVal / 1000
      : distanceVal * 0.000621371
    ).toFixed(2) +
    ' ' +
    distanceUnit;

  const riseStat = rise && (
    <span>
      <Icon type="arrow-graph-up-right" width="14" height="14" title="Rise" />{' '}
      {rise}
    </span>
  );

  const dropStat = drop && (
    <span>
      <Icon type="arrow-graph-down-right" width="14" height="14" title="Drop" />{' '}
      {drop}
    </span>
  );

  const elevations = data.elevations
    ? data.elevations.map(({ elevation }) => {
        return {
          value: elevation,
          title:
            Math.round(heightUnit === 'm' ? elevation : elevation * 3.28084) +
            ' ' +
            heightUnit,
        };
      })
    : null;

  const handleBarHover = (index) => {
    if (index) {
      const { location } = data.elevations[index];
      Map.showPinpointMarker(location);
    } else {
      Map.hidePinpointMarker();
    }
  };

  return (
    <a>
      <div className="heading">
        <Icon type={iconType} width="24" height="24" title={iconType} /> via{' '}
        {route.summary}
      </div>
      <Chart
        data={elevations}
        domain={domain}
        width={`${width}%`}
        height={height}
        onBarMouseEnter={handleBarHover}
        onBarMouseLeave={handleBarHover}
      />
      <div className="stats">
        {riseStat}&nbsp;&nbsp;&nbsp;{dropStat}
      </div>
      <div className="metadata">
        {leg.duration.text}&nbsp;&nbsp;&nbsp;{distance}
      </div>
    </a>
  );
};

ReactDOM.render(<App />, document.getElementById('app'));
