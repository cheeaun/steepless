import React from 'react';

import createReactClass from 'create-react-class';

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

class App extends React.Component {
  state = {
    start: '',
    end: '',
    routes: null,
    distanceUnit: localStorage['steepless:distanceUnit'] || 'km',
    heightUnit: localStorage['steepless:heightUnit'] || 'm',
    travelMode: 'walking',
  };

  componentDidMount() {
    this.hashChange();
    var self = this;
    window.onhashchange = function () {
      self.hashChange();
    };
  }

  componentDidUpdate() {
    localStorage['steepless:distanceUnit'] = this.state.distanceUnit;
    localStorage['steepless:heightUnit'] = this.state.heightUnit;
  }

  hashChange = () => {
    var hash = location.hash.slice(1);
    if (!hash) return;

    var locations = hash.split('/');
    var travelMode = decodeURIComponent(locations[0]);
    var origin = decodeURIComponent(locations[1]);
    var destination = decodeURIComponent(locations[2]);

    this.setState(
      {
        travelMode: travelMode,
        start: origin,
        end: destination,
      },
      this.getRoutes,
    );
  };

  getRoutes = () => {
    var self = this;
    var state = this.state;

    Steepless.directionsService.route(
      {
        origin: state.start,
        destination: state.end,
        travelMode: google.maps.TravelMode[this.state.travelMode.toUpperCase()],
        provideRouteAlternatives: true,
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      function (response, status) {
        if (status == google.maps.DirectionsStatus.OK) {
          var routes = response.routes;
          var longestDistance = 0;
          routes.forEach(function (route) {
            var distance = route.legs[0].distance.value;
            if (distance > longestDistance) longestDistance = distance;
          });
          Steepless.longestDistance = longestDistance;
          self.setState({
            routes: routes.map(function (route, i) {
              return {
                route: route,
                selected: i == 0,
              };
            }),
          });

          Steepless.directionsRenderer.setDirections(response);

          self.getElevations();
        } else {
          self.setState({
            routes: [],
          });
        }
      },
    );
  };

  getElevations = () => {
    var self = this;
    var routes = this.state.routes;

    const elevationCalls = routes.map((data) => {
      return new Promise((resolve, reject) => {
        var route = data.route;
        var path = route.overview_path;
        var distance = route.legs[0].distance.value;
        var samples = Math.round(
          (distance / Steepless.longestDistance) *
            (Steepless.chartWidth / Steepless.chartBarWidth),
        );
        Steepless.elevationService.getElevationAlongPath(
          {
            path: path,
            samples: samples,
          },
          function (result, status) {
            if (status == google.maps.ElevationStatus.OK) {
              resolve({
                data: data,
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
      .then(function (results) {
        var highestElevation = 0,
          lowestElevation = Infinity;

        results.forEach(function (result, i) {
          var elevations = result.elevations;
          var prevElevation = elevations[0].elevation;
          var rise = 0,
            drop = 0;

          elevations.forEach(function (r) {
            var elevation = r.elevation;
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
        self.setState({
          routes: routes,
        });
      })
      .catch(function (err) {
        console.log(err);
      });
  };

  handleRouteClick = (index) => {
    this.state.routes.forEach(function (d, i) {
      d.selected = index == i;
    });
    this.setState(this.state);

    Steepless.directionsRenderer.setRouteIndex(index);
  };

  handleUnitChange = (units) => {
    this.setState(units);
  };

  handleTravelModeChange = (travelMode) => {
    this.setState({
      travelMode: travelMode,
    });
  };

  render() {
    var units = {
      distance: this.state.distanceUnit,
      height: this.state.heightUnit,
    };
    var travelMode = this.state.travelMode;
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
            start={this.state.start}
            end={this.state.end}
            units={units}
            travelMode={travelMode}
            onUnitChange={this.handleUnitChange}
            onTravelModeChange={this.handleTravelModeChange}
          />
          <RouteList
            data={this.state.routes}
            travelMode={travelMode}
            units={units}
            onRouteClick={this.handleRouteClick}
          />
        </div>
      </div>
    );
  }
}

class Icon extends React.Component {
  render() {
    var type = this.props.type;
    var title = this.props.title;
    return (
      <svg
        title={title}
        className="icon"
        dangerouslySetInnerHTML={{
          __html: '<use xlink:href="assets/icons.svg#icon-' + type + '"></use>',
        }}
        width={this.props.width}
        height={this.props.height}
      ></svg>
    );
  }
}

class Map extends React.Component {
  static defaultProps = {
    map: {
      center: new google.maps.LatLng(37.7577, -122.4376),
      zoom: 12,
      disableDefaultUI: true,
      mapId: '4e570dd5e962cb58',
    },
  };

  static pinpointMarker = new google.maps.Marker({
    visible: false,
    clickable: false,
    zIndex: 1000,
  });

  static showPinpointMarker(location) {
    this.pinpointMarker.setPosition(location);
    this.pinpointMarker.setVisible(true);
  }

  static hidePinpointMarker() {
    this.pinpointMarker.setVisible(false);
  }

  componentDidMount() {
    var node = ReactDOM.findDOMNode(this);
    var map = new google.maps.Map(node, this.props.map);
    Map.pinpointMarker.setMap(map);

    Steepless.directionsRenderer.setMap(map);
  }

  render() {
    return <div id="map-canvas"></div>;
  }
}

class Chart extends React.Component {
  handleBarMouseEnter = (index) => {
    this.props.onBarMouseEnter(index);
  };

  handleBarMouseLeave = () => {
    this.props.onBarMouseLeave();
  };

  render() {
    var self = this;
    var props = this.props;
    var chartStyle = {
      width: props.width,
      height: 0, // initially zero height
    };
    var bars = '';
    if (props.data) {
      bars = props.data.map(function (d, i) {
        var style = {
          borderBottomWidth: (props.height * d.value) / props.domain[1],
        };
        var key = i + '-' + d.value;
        return (
          <div
            style={style}
            key={key}
            onMouseEnter={self.handleBarMouseEnter.bind(self, i)}
            onMouseLeave={self.handleBarMouseLeave}
          >
            <span>{d.title}</span>
          </div>
        );
      });
      chartStyle.height = props.height; // then grow the height, CSS transition applied here
    }
    return (
      <div className="chart" style={chartStyle}>
        {bars}
      </div>
    );
  }
}

class RouteForm extends React.Component {
  updateLocationHash = (travelMode, start, end) => {
    if (!travelMode) travelMode = this.props.travelMode;
    if (!start) start = this.props.start;
    if (!end) end = this.props.end;
    if (!start || !end) return;
    location.hash =
      travelMode +
      '/' +
      encodeURIComponent(start) +
      '/' +
      encodeURIComponent(end);
  };

  handleSubmit = (e) => {
    e.preventDefault();
    var travelMode = ReactDOM.findDOMNode(this.refs.travelMode).value;
    var start = ReactDOM.findDOMNode(this.refs.start).value.trim();
    var end = ReactDOM.findDOMNode(this.refs.end).value.trim();
    this.updateLocationHash(travelMode, start, end);
  };

  componentDidMount() {
    var startNode = ReactDOM.findDOMNode(this.refs.start);
    var endNode = ReactDOM.findDOMNode(this.refs.end);
    var start = startNode.value.trim();
    var end = endNode.value.trim();

    if (start && end) {
      if (this.props.start) startNode.value = this.props.start;
      if (this.props.end) endNode.value = this.props.end;
    }

    new google.maps.places.Autocomplete(startNode);
    new google.maps.places.Autocomplete(endNode);
  }

  componentWillReceiveProps() {
    if (this.props.travelMode)
      ReactDOM.findDOMNode(this.refs.travelMode).value = this.props.travelMode;
    if (this.props.start)
      ReactDOM.findDOMNode(this.refs.start).value = this.props.start;
    if (this.props.end)
      ReactDOM.findDOMNode(this.refs.end).value = this.props.end;
  }

  handleTravelModeChange = () => {
    var travelMode = ReactDOM.findDOMNode(this.refs.travelMode).value;
    this.updateLocationHash(travelMode);
  };

  handleFlip = (e) => {
    e.preventDefault();
    var start = ReactDOM.findDOMNode(this.refs.start).value.trim();
    var end = ReactDOM.findDOMNode(this.refs.end).value.trim();
    this.updateLocationHash(null, end, start);
  };

  handleDistanceChange = () => {
    var unit = ReactDOM.findDOMNode(this.refs.distanceSelect).value;
    this.props.onUnitChange({
      distanceUnit: unit,
    });
  };

  handleHeightChange = () => {
    var unit = ReactDOM.findDOMNode(this.refs.heightSelect).value;
    this.props.onUnitChange({
      heightUnit: unit,
    });
  };

  render() {
    var units = this.props.units;
    return (
      <form id="directions-form" onSubmit={this.handleSubmit}>
        <div className="field-section">
          <label>
            <select ref="travelMode" onChange={this.handleTravelModeChange}>
              <option value="walking">Walking</option>
              <option value="bicycling">Bicycling</option>
              <option value="driving">Driving</option>
            </select>{' '}
            from
          </label>
          <input
            ref="start"
            id="directions-start"
            placeholder="Start"
            required
          />
        </div>
        <a
          href="#"
          id="flip-direction"
          onClick={this.handleFlip}
          title="Flip origin and destination"
          tabIndex="-1"
        >
          <Icon type="arrow-right" width="14" height="14"></Icon>
        </a>
        <div className="field-section">
          <label htmlFor="directions-end">To</label>
          <input
            ref="end"
            id="directions-end"
            placeholder="Destination"
            required
          />
        </div>
        <div className="form-footer">
          <div className="options">
            <Icon type="widget" width="20" height="20" title="Settings"></Icon>
            <span>
              <label>
                Distance&nbsp;
                <select
                  ref="distanceSelect"
                  value={units.distance}
                  onChange={this.handleDistanceChange}
                >
                  <option value="km">km</option>
                  <option value="miles">miles</option>
                </select>
              </label>
              &nbsp;
              <label>
                Height&nbsp;
                <select
                  ref="heightSelect"
                  value={units.height}
                  onChange={this.handleHeightChange}
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
  }
}

class RouteList extends React.Component {
  handleClick = (index) => {
    this.props.onRouteClick(index);
  };

  handlePinpoint = (data) => {
    this.props.onSetPinpoint(data);
  };

  render() {
    var self = this;
    var data = this.props.data;
    if (data && data.length) {
      var routes = this.props.data.map(function (d, i) {
        var key = i + '' + d.route.bounds.toString();
        return (
          <li
            key={key}
            className={d.selected ? 'selected' : ''}
            onClick={self.handleClick.bind(self, i)}
          >
            <Route
              data={d}
              units={self.props.units}
              travelMode={self.props.travelMode}
              onSetPinpoint={self.handlePinpoint}
            />
          </li>
        );
      });
      return (
        <div id="routes-container">
          <ul id="routes-list">{routes}</ul>
        </div>
      );
    } else if (!!data) {
      return (
        <div id="routes-container">
          <p>Oops, there are no routes found.</p>
        </div>
      );
    } else {
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
    }
  }
}

var Route = createReactClass({
  displayName: 'Route',

  handleBarHover: function (index) {
    if (index) {
      var data = this.props.data.elevations[index];
      Map.showPinpointMarker(data.location);
    } else {
      Map.hidePinpointMarker();
    }
  },

  iconMap: {
    walking: 'pedestrian',
    bicycling: 'bicycle',
    driving: 'car-side',
  },

  render: function () {
    var data = this.props.data;
    var units = this.props.units;
    var route = data.route;
    var leg = route.legs[0];
    var distance = leg.distance.value;
    var width = Math.ceil(
      (distance / Steepless.longestDistance) * Steepless.chartWidth,
    );
    var chartWidth = { width: width };
    var stats = data.stats;
    var domain = [0, Steepless.highestElevation];

    var iconType = this.iconMap[this.props.travelMode];

    var height = Math.round(
      (Steepless.highestElevation - Steepless.lowestElevation) / 2,
    );
    var rise = null,
      drop = null,
      heightUnit = units.height;
    if (stats) {
      var statsRise = stats.rise,
        statsDrop = stats.drop;
      rise =
        Math.round(heightUnit == 'm' ? statsRise : statsRise * 3.28084) +
        ' ' +
        heightUnit;
      drop =
        Math.round(heightUnit == 'm' ? statsDrop : statsDrop * 3.28084) +
        ' ' +
        heightUnit;
    }

    var distanceUnit = units.distance;
    var distanceVal = leg.distance.value;
    var distance =
      (distanceUnit == 'km'
        ? distanceVal / 1000
        : distanceVal * 0.000621371
      ).toFixed(2) +
      ' ' +
      distanceUnit;
    var riseStat = rise ? (
      <span>
        <Icon
          type="arrow-graph-up-right"
          width="14"
          height="14"
          title="Rise"
        ></Icon>{' '}
        {rise}
      </span>
    ) : (
      ''
    );
    var dropStat = drop ? (
      <span>
        <Icon
          type="arrow-graph-down-right"
          width="14"
          height="14"
          title="Drop"
        ></Icon>{' '}
        {drop}
      </span>
    ) : (
      ''
    );

    var elevations = data.elevations
      ? data.elevations.map(function (d) {
          var elevation = d.elevation;
          return {
            value: elevation,
            title:
              Math.round(heightUnit == 'm' ? elevation : elevation * 3.28084) +
              ' ' +
              heightUnit,
          };
        })
      : null;

    return (
      <a>
        <div className="heading">
          <Icon type={iconType} width="24" height="24" title={iconType}></Icon>{' '}
          via {route.summary}
        </div>
        <Chart
          data={elevations}
          domain={domain}
          width={width}
          height={height}
          onBarMouseEnter={this.handleBarHover}
          onBarMouseLeave={this.handleBarHover}
        />
        <div className="stats">
          {riseStat}&nbsp;&nbsp;&nbsp;{dropStat}
        </div>
        <div className="metadata">
          {leg.duration.text}&nbsp;&nbsp;&nbsp;{distance}
        </div>
      </a>
    );
  },
});

ReactDOM.render(<App />, document.getElementById('app'));
