import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import ReactDOM from 'react-dom';

const directionsService = new google.maps.DirectionsService();
const directionsRenderer = new google.maps.DirectionsRenderer();
const elevationService = new google.maps.ElevationService();

const iconMap = {
  walking: 'pedestrian',
  bicycling: 'bicycle',
  driving: 'car-side',
};
const chart = {
  width: 400,
  barWidth: 2,
};

const pinpointMarker = new google.maps.Marker({
  visible: false,
  clickable: false,
  zIndex: 1000,
});
const showPinpointMarker = (location) => {
  pinpointMarker.setPosition(location);
  pinpointMarker.setVisible(true);
};
const hidePinpointMarker = () => {
  pinpointMarker.setVisible(false);
};

const Icon = ({ type, ...props }) => (
  <svg className="icon" {...props}>
    <use xlinkHref={`assets/icons.svg#icon-${type}`} />
  </svg>
);

const convertMetersToFeet = (meters) => meters * 3.28084;
const convertMetersToKilometers = (meters) => meters * 0.001;
const convertMetersToMiles = (meters) => meters * 0.000621371;

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
    directionsRenderer.setMap(map);
  }, []);

  return <div ref={mapRef} id="map-canvas" />;
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

const Route = ({
  route,
  selected,
  travelMode,
  longestDistance,
  heightUnit,
  distanceUnit,
  onClick = () => {},
}) => {
  const [elevations, setElevations] = useState([]);
  useEffect(() => {
    const path = route.overview_path;
    const distance = route.legs[0].distance.value;
    const samples = Math.round(
      (distance / longestDistance) * (chart.width / chart.barWidth),
    );
    elevationService.getElevationAlongPath(
      {
        path,
        samples,
      },
      (result, status) => {
        if (status === google.maps.ElevationStatus.OK) {
          console.log({ elevations: result });
          setElevations(result);
        } else {
          // TODO: What to do here?
          setElevations([]);
        }
      },
    );
  }, [route]);

  const leg = route.legs[0];
  const distanceVal = leg.distance.value;
  const width =
    (Math.ceil((distanceVal / longestDistance) * chart.width) / chart.width) *
    100;

  let highestElevation = 0;
  let lowestElevation = Infinity;
  let prevElevation = elevations[0]?.elevation;
  let rise = 0;
  let drop = 0;

  elevations.forEach(({ elevation }) => {
    if (elevation > prevElevation) {
      rise += elevation - prevElevation;
    }
    if (elevation < prevElevation) {
      drop += prevElevation - elevation;
    }
    prevElevation = elevation;

    if (elevation > highestElevation) {
      highestElevation = elevation;
    }
    if (elevation < lowestElevation) {
      lowestElevation = elevation;
    }
  });

  const domain = [0, highestElevation];
  const height = Math.round((highestElevation - lowestElevation) / 2);

  const riseStat = !!rise && (
    <span>
      <Icon type="arrow-graph-up-right" width="14" height="14" title="Rise" />{' '}
      {Math.round(heightUnit === 'm' ? rise : convertMetersToFeet(rise)) +
        ' ' +
        heightUnit}
    </span>
  );

  const dropStat = !!drop && (
    <span>
      <Icon type="arrow-graph-down-right" width="14" height="14" title="Drop" />{' '}
      {Math.round(heightUnit === 'm' ? drop : convertMetersToFeet(drop)) +
        ' ' +
        heightUnit}
    </span>
  );

  const handleBarHover = (index) => {
    if (index) {
      const { location } = elevations[index];
      showPinpointMarker(location);
    } else {
      hidePinpointMarker();
    }
  };

  return (
    <div
      className={selected ? 'selected' : ''}
      onClick={selected ? () => {} : onClick}
    >
      <div className="heading">
        <Icon
          type={iconMap[travelMode]}
          width="24"
          height="24"
          title={travelMode}
        />{' '}
        via {route.summary}
      </div>
      <Chart
        data={elevations.map(({ elevation }) => ({
          value: elevation,
          title: `${Math.round(
            heightUnit === 'm' ? elevation : convertMetersToFeet(elevation),
          )} ${heightUnit}`,
        }))}
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
        {leg.duration.text}&nbsp;&nbsp;&nbsp;
        {(distanceUnit === 'km'
          ? convertMetersToKilometers(distanceVal)
          : convertMetersToMiles(distanceVal)
        ).toFixed(2)}{' '}
        {distanceUnit}
      </div>
    </div>
  );
};

const App = () => {
  const [travelMode, setTravelMode] = useState('walking');
  const [distanceUnit, setDistanceUnit] = useState(
    localStorage['steepless:distanceUnit'] || 'km',
  );
  const [heightUnit, setHeightUnit] = useState(
    localStorage['steepless:heightUnit'] || 'm',
  );
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [error, setError] = useState(null);

  const startFieldRef = useRef();
  const endFieldRef = useRef();

  useEffect(() => {
    const hashChange = () => {
      const hash = location.hash.slice(1);
      if (!hash) return;

      const [travelMode, origin, destination] = hash
        .split('/')
        .map(decodeURIComponent);
      setTravelMode(travelMode);
      startFieldRef.current.value = origin;
      endFieldRef.current.value = destination;

      setError(null);

      directionsService.route(
        {
          origin,
          destination,
          travelMode: google.maps.TravelMode[travelMode.toUpperCase()],
          provideRouteAlternatives: true,
          unitSystem: google.maps.UnitSystem.METRIC,
        },
        (response, status) => {
          if (status === google.maps.DirectionsStatus.OK) {
            const { routes } = response;
            console.log({ response });
            setRoutes(routes);
            setSelectedRouteIndex(0);
            directionsRenderer.setDirections(response);
          } else {
            setRoutes([]);
            setError({ status });
          }
        },
      );
    };
    hashChange();
    window.addEventListener('hashchange', hashChange);

    new google.maps.places.Autocomplete(startFieldRef.current);
    new google.maps.places.Autocomplete(endFieldRef.current);
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const origin = startFieldRef.current.value;
      const destination = endFieldRef.current.value;
      const hash = `${travelMode}/${encodeURIComponent(
        origin,
      )}/${encodeURIComponent(destination)}`;
      location.hash = hash;
    },
    [travelMode],
  );

  const longestDistance = useMemo(() => {
    if (!routes || !routes.length) return 0;
    return Math.max(...routes.map((r) => r.legs[0].distance.value));
  }, [routes]);

  return (
    <div>
      <Map />
      <div id="sidebar">
        <header>
          <h1>
            <Icon type="mountains" width="24" height="24" /> Steepless
          </h1>
        </header>
        <form id="directions-form" onSubmit={handleSubmit}>
          <div class="form-fields">
            <div className="field-section">
              <label>
                <select
                  value={travelMode}
                  onChange={(e) => {
                    const { value } = e.target;
                    const startValue = startFieldRef.current.value;
                    const endValue = endFieldRef.current.value;
                    if (startValue && endValue) {
                      location.hash = `${value}/${startValue}/${endValue}`;
                    } else {
                      setTravelMode(value);
                    }
                  }}
                >
                  <option value="walking">Walking</option>
                  <option value="bicycling">Cycling</option>
                  <option value="driving">Driving</option>
                </select>{' '}
                from
              </label>
              <input
                ref={startFieldRef}
                id="directions-start"
                placeholder="Start"
                required
              />
            </div>
            <a
              href={
                startFieldRef.current && endFieldRef.current
                  ? `#${travelMode}/${encodeURIComponent(
                      endFieldRef.current.value.trim(),
                    )}/${encodeURIComponent(
                      startFieldRef.current.value.trim(),
                    )}`
                  : '#'
              }
              id="flip-direction"
              title="Flip origin and destination"
              tabIndex="-1"
            >
              <Icon type="arrow-right" width="14" height="14"></Icon>
            </a>
            <div className="field-section">
              <label htmlFor="directions-end">To</label>
              <input
                ref={endFieldRef}
                id="directions-end"
                placeholder="Destination"
                required
              />
            </div>
          </div>
          <div className="form-footer">
            <div className="options">
              <Icon
                type="widget"
                width="20"
                height="20"
                title="Settings"
              ></Icon>
              <span>
                <label>
                  Distance&nbsp;
                  <select
                    value={distanceUnit}
                    onChange={(e) => {
                      localStorage['steepless:distanceUnit'] = e.target.value;
                      setDistanceUnit(e.target.value);
                    }}
                  >
                    <option value="km">km</option>
                    <option value="miles">miles</option>
                  </select>
                </label>
                &nbsp;
                <label>
                  Height&nbsp;
                  <select
                    value={heightUnit}
                    onChange={(e) => {
                      localStorage['steepless:heightUnit'] = e.target.value;
                      setHeightUnit(e.target.value);
                    }}
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
        <div id="routes-container">
          {routes?.length > 0 && (
            <ul id="routes-list">
              {routes.map((route, i) => (
                <li key={`${i}${route.summary}`}>
                  <Route
                    route={route}
                    travelMode={travelMode}
                    heightUnit={heightUnit}
                    distanceUnit={distanceUnit}
                    longestDistance={longestDistance}
                    selected={i === selectedRouteIndex}
                    onClick={() => {
                      setSelectedRouteIndex(i);
                      directionsRenderer.setRouteIndex(i);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          {!!error?.status && (
            <p>
              {error.status === 'ZERO_RESULTS'
                ? 'Oops, there are no routes found.'
                : 'Oooops, something is wrong. Please try again later or change the locations.'}
            </p>
          )}
          {!error && !routes?.length && (
            <>
              <p>
                Begin by entering the Start and Destination locations above.
              </p>
              <p>
                Try an example:{' '}
                <a href={`#walking/Chinatown, SF/Twin Peaks, SF`}>
                  Walking from Chinatown to Twin Peaks
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('app'));
