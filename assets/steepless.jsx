import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import ReactDOM from 'react-dom';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PathLayer } from '@deck.gl/layers';

const directionsService = new google.maps.DirectionsService();
const directionsRenderer = new google.maps.DirectionsRenderer({
  suppressBicyclingLayer: true,
  hideRouteList: true,
  polylineOptions: {
    strokeColor: '#259b24',
  },
  markerOptions: {
    animation: google.maps.Animation.DROP,
  },
});
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
const distanceUnit = {
  metric: 'km',
  imperial: 'miles',
};
const heightUnit = {
  metric: 'm',
  imperial: 'ft',
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

const aMarker = new google.maps.Marker({
  visible: false,
  label: 'A',
  clickable: false,
  zIndex: 500,
});
const bMarker = new google.maps.Marker({
  visible: false,
  label: 'B',
  clickable: false,
  zIndex: 500,
});

const Icon = ({ type, ...props }) => (
  <svg className="icon" {...props}>
    <use xlinkHref={`assets/icons.svg#icon-${type}`} />
  </svg>
);

const convertMetersToFeet = (meters) => meters * 3.28084;
const convertMetersToKilometers = (meters) => meters * 0.001;
const convertMetersToMiles = (meters) => meters * 0.000621371;

const Map = ({ onInit = () => {} }) => {
  const mapRef = useRef();
  useEffect(() => {
    const map = new google.maps.Map(mapRef.current, {
      center: new google.maps.LatLng(37.7577, -122.4376),
      zoom: 12,
      mapId: 'f7422a246595028',
      disableDefaultUI: true,
      zoomControl: true,
    });

    onInit(map);
  }, []);

  return <div ref={mapRef} id="map-canvas" />;
};

const ThreeDControl = (controlDiv, map) => {
  let mode3D = false;
  const controlUI = document.createElement('button');
  controlUI.className = 'control-3d';
  controlUI.innerHTML = '3D';
  controlDiv.appendChild(controlUI);
  map.addListener('bounds_changed', () => {
    const initialTilt = map.getTilt();
    const initialHeading = map.getHeading();
    if (initialTilt <= 10 && initialHeading <= 10) {
      mode3D = false;
      controlUI.innerHTML = '3D';
    } else {
      mode3D = true;
      controlUI.innerHTML = '2D';
    }
  });
  controlUI.addEventListener('click', () => {
    mode3D = !mode3D;
    const initialZoom = map.getZoom();
    map.setTilt(mode3D ? 45 : 0);
    map.setHeading(mode3D ? -45 : 0);
    map.setZoom(mode3D ? initialZoom + 1 : initialZoom - 1);
  });
};

const Chart = ({
  width,
  height,
  data,
  domain,
  onBarMouseEnter = () => {},
  onBarMouseLeave = () => {},
  onBarClick = () => {},
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
        onClick={() => {
          onBarClick(i);
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
  renderingType,
  travelMode,
  longestDistance,
  unitSystem,
  overlayRef,
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

  useEffect(() => {
    if (renderingType !== google.maps.RenderingType.VECTOR) return;
    if (!selected) return;

    aMarker.setPosition(route.overview_path[0]);
    aMarker.setVisible(true);
    bMarker.setPosition(route.overview_path[route.overview_path.length - 1]);
    bMarker.setVisible(true);
  }, [route, selected, renderingType]);

  useEffect(() => {
    if (renderingType !== google.maps.RenderingType.VECTOR) return;
    if (!elevations.length) return;
    if (!selected) return;

    const routePath = route.overview_path.map((point) => [
      point.lng(),
      point.lat(),
    ]);

    const bounds = new google.maps.LatLngBounds();
    routePath.forEach((point) =>
      bounds.extend({ lat: point[1], lng: point[0] }),
    );
    overlayRef.current._map.fitBounds(bounds, 100);

    const elevatedRoute = [];
    const elevationPolls = [];
    elevations.forEach((el) => {
      const { location, elevation } = el;
      const lng = location.lng();
      const lat = location.lat();
      elevatedRoute.push([lng, lat, elevation]);
      elevationPolls.push({
        path: [
          [lng, lat, 0],
          [lng, lat, elevation],
        ],
      });
    });

    console.log({
      overlay: overlayRef.current,
      routePath,
      elevatedRoute,
      elevationPolls,
    });
    overlayRef.current.setProps({
      layers: [
        new PathLayer({
          id: 'route',
          data: [
            {
              path: routePath,
            },
          ],
          widthUnits: 'pixels',
          widthScale: 3,
          capRounded: true,
          jointRounded: true,
          getColor: [37, 155, 36],
        }),
        new PathLayer({
          id: `elevated-route-${route.summary}`,
          data: [
            {
              path: elevatedRoute,
            },
            ...elevationPolls,
          ],
          widthUnits: 'pixels',
          widthScale: 1,
          capRounded: true,
          jointRounded: true,
          getColor: [37, 155, 36, 150],
          billboard: true,
          updateTriggers: {
            data: elevations,
          },
        }),
      ],
    });
  }, [route, selected, elevations, renderingType]);

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
  const height = Math.round((highestElevation - lowestElevation) * 0.25);

  const riseStat = !!rise && (
    <span>
      <Icon type="arrow-graph-up-right" width="14" height="14" title="Rise" />{' '}
      {Math.round(unitSystem === 'metric' ? rise : convertMetersToFeet(rise)) +
        ' ' +
        heightUnit[unitSystem]}
    </span>
  );

  const dropStat = !!drop && (
    <span>
      <Icon type="arrow-graph-down-right" width="14" height="14" title="Drop" />{' '}
      {Math.round(unitSystem === 'metric' ? drop : convertMetersToFeet(drop)) +
        ' ' +
        heightUnit[unitSystem]}
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
            unitSystem === 'metric'
              ? elevation
              : convertMetersToFeet(elevation),
          )} ${heightUnit[unitSystem]}`,
        }))}
        domain={domain}
        width={`${width}%`}
        height={height}
        onBarMouseEnter={handleBarHover}
        onBarMouseLeave={handleBarHover}
        onBarClick={(i) => {
          const { location } = elevations[i];
          const map = overlayRef.current._map;
          map.panTo(location);
          const initialZoom = map.getZoom();
          if (initialZoom < 17) {
            map.setZoom(17);
          }
        }}
      />
      <div className="stats">
        {riseStat}&nbsp;&nbsp;&nbsp;{dropStat}
      </div>
      <div className="metadata">
        {leg.duration.text}&nbsp;&nbsp;&nbsp;
        {(unitSystem === 'metric'
          ? convertMetersToKilometers(distanceVal)
          : convertMetersToMiles(distanceVal)
        ).toFixed(2)}{' '}
        {distanceUnit[unitSystem]}
      </div>
    </div>
  );
};

const App = () => {
  const [travelMode, setTravelMode] = useState('walking');
  const [unitSystem, setUnitSystem] = useState(
    localStorage['steepless:unitSystem'] || 'metric',
  );
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [error, setError] = useState(null);

  // https://developers.google.com/maps/documentation/javascript/reference/map#RenderingType
  const [renderingType, setRenderingType] = useState(null); // RASTER | VECTOR

  const startFieldRef = useRef();
  const endFieldRef = useRef();
  const overlayRef = useRef();

  useEffect(() => {
    const hashChange = () => {
      const hash = location.hash.slice(1);
      if (!hash) return;

      const [travelMode, origin, destination] = hash
        .split('/')
        .map(decodeURIComponent);
      if (travelMode) setTravelMode(travelMode);
      if (origin) startFieldRef.current.value = origin;
      if (destination) endFieldRef.current.value = destination;

      setError(null);

      if (origin && destination) {
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
      }
    };
    hashChange();
    window.addEventListener('hashchange', hashChange);
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault();
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
      <Map
        onInit={(map) => {
          pinpointMarker.setMap(map);

          const startAutocomplete = new google.maps.places.Autocomplete(
            startFieldRef.current,
          );
          startAutocomplete.bindTo('bounds', map);
          startAutocomplete.addListener('place_changed', handleSubmit);
          const endAutocomplete = new google.maps.places.Autocomplete(
            endFieldRef.current,
          );
          endAutocomplete.bindTo('bounds', map);
          endAutocomplete.addListener('place_changed', handleSubmit);

          map.addListener('renderingtype_changed', (e) => {
            const rendering = map.getRenderingType();
            setRenderingType(rendering);
            if (rendering === google.maps.RenderingType.VECTOR) {
              directionsRenderer.setMap(null);
              aMarker.setMap(map);
              bMarker.setMap(map);

              const controlDiv = document.createElement('div');
              ThreeDControl(controlDiv, map);
              map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
                controlDiv,
              );

              const overlay = (overlayRef.current = new GoogleMapsOverlay({
                // Mobile-optimized props
                _pickable: false,
                _typedArrayManagerProps: { overAlloc: 1, poolSize: 0 },
              }));
              overlay.setMap(map);
            } else {
              directionsRenderer.setMap(map);
              aMarker.setMap(null);
              bMarker.setMap(null);
            }
          });
        }}
      />
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
                  Units&nbsp;
                  <select
                    value={unitSystem}
                    onChange={(e) => {
                      const { value } = e.target;
                      localStorage['steepless:unitSystem'] = value;
                      setUnitSystem(value);
                    }}
                  >
                    <option value="metric">Metric (km, m)</option>
                    <option value="imperial">Imperial (miles, ft)</option>
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
                    renderingType={renderingType}
                    travelMode={travelMode}
                    unitSystem={unitSystem}
                    longestDistance={longestDistance}
                    selected={i === selectedRouteIndex}
                    onClick={() => {
                      setSelectedRouteIndex(i);
                      directionsRenderer.setRouteIndex(i);
                    }}
                    overlayRef={overlayRef}
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
