var Steepless = {
    directionsService: new google.maps.DirectionsService(),
    directionsRenderer: new google.maps.DirectionsRenderer(),
    elevationService: new google.maps.ElevationService(),
    longestDistance: 0,
    highestElevation: 0,
    lowestElevation: Infinity,
    chartWidth: 400,
    chartBarWidth: 2
};
var App = React.createClass({
    getInitialState: function getInitialState() {
        return {
            start: '',
            end: '',
            routes: null,
            distanceUnit: localStorage['steepless:distanceUnit'] || 'km',
            heightUnit: localStorage['steepless:heightUnit'] || 'm',
            travelMode: 'walking'
        };
    },
    componentDidMount: function componentDidMount() {
        this.hashChange();
        var self = this;
        window.onhashchange = function() {
            self.hashChange();
        };
    },
    componentDidUpdate: function componentDidUpdate() {
        localStorage['steepless:distanceUnit'] = this.state.distanceUnit;
        localStorage['steepless:heightUnit'] = this.state.heightUnit;
    },
    hashChange: function hashChange() {
        var hash = location.hash.slice(1);
        if (!hash) return;
        var locations = hash.split('/');
        var travelMode = decodeURIComponent(locations[0]);
        var origin = decodeURIComponent(locations[1]);
        var destination = decodeURIComponent(locations[2]);
        this.setState({
            travelMode: travelMode,
            start: origin,
            end: destination
        });
        this.getRoutes();
    },
    getRoutes: function getRoutes() {
        var self = this;
        var state = this.state;
        Steepless.directionsService.route({
            origin: state.start,
            destination: state.end,
            travelMode: google.maps.TravelMode[this.state.travelMode.toUpperCase()],
            provideRouteAlternatives: true,
            unitSystem: google.maps.UnitSystem.METRIC
        }, function(response, status) {
            if (status == google.maps.DirectionsStatus.OK) {
                var routes = response.routes;
                var longestDistance = 0;
                routes.forEach(function(route) {
                    var distance = route.legs[0].distance.value;
                    if (distance > longestDistance) longestDistance = distance;
                });
                Steepless.longestDistance = longestDistance;
                self.setState({
                    routes: routes.map(function(route, i) {
                        return {
                            route: route,
                            selected: i == 0
                        };
                    })
                });
                Steepless.directionsRenderer.setDirections(response);
                self.getElevations();
            } else {
                self.setState({
                    routes: []
                });
            }
        });
    },
    getElevations: function getElevations() {
        var self = this;
        var routes = this.state.routes;
        var q = queue();
        routes.forEach(function(data, i) {
            q.defer(function(done) {
                var route = data.route;
                var path = route.overview_path;
                var distance = route.legs[0].distance.value;
                var samples = Math.round(distance / Steepless.longestDistance * (Steepless.chartWidth / Steepless.chartBarWidth));
                Steepless.elevationService.getElevationAlongPath({
                    path: path,
                    samples: samples
                }, function(result, status) {
                    if (status == google.maps.ElevationStatus.OK) {
                        done(null, {
                            data: data,
                            elevations: result
                        });
                    } else {
                        done(status);
                    }
                });
            });
        });
        q.awaitAll(function(error, results) {
            if (error) {
                console.log(error);
                return;
            }
            var highestElevation = 0, lowestElevation = Infinity;
            results.forEach(function(result, i) {
                var elevations = result.elevations;
                var prevElevation = elevations[0].elevation;
                var rise = 0, drop = 0;
                elevations.forEach(function(r) {
                    var elevation = r.elevation;
                    if (elevation > prevElevation) rise += elevation - prevElevation;
                    if (elevation < prevElevation) drop += prevElevation - elevation;
                    prevElevation = elevation;
                    if (elevation > highestElevation) highestElevation = elevation;
                    if (elevation < lowestElevation) lowestElevation = elevation;
                });
                result.data.stats = {
                    rise: rise,
                    drop: drop
                };
                result.data.elevations = elevations;
            });
            Steepless.highestElevation = highestElevation;
            Steepless.lowestElevation = lowestElevation;
            self.setState({
                routes: routes
            });
        });
    },
    handleRouteClick: function handleRouteClick(index) {
        this.state.routes.forEach(function(d, i) {
            d.selected = index == i;
        });
        this.setState(this.state);
        Steepless.directionsRenderer.setRouteIndex(index);
    },
    handleUnitChange: function handleUnitChange(units) {
        this.setState(units);
    },
    handleTravelModeChange: function handleTravelModeChange(travelMode) {
        this.setState({
            travelMode: travelMode
        });
    },
    render: function render() {
        var units = {
            distance: this.state.distanceUnit,
            height: this.state.heightUnit
        };
        var travelMode = this.state.travelMode;
        return(/*#__PURE__*/ React.createElement("div", null, /*#__PURE__*/ React.createElement(Map, null), /*#__PURE__*/ React.createElement("div", {
            id: "sidebar"
        }, /*#__PURE__*/ React.createElement("header", null, /*#__PURE__*/ React.createElement("h1", null, /*#__PURE__*/ React.createElement(Icon, {
            type: "mountains",
            width: "24",
            height: "24"
        }), " Steepless")), /*#__PURE__*/ React.createElement(RouteForm, {
            start: this.state.start,
            end: this.state.end,
            units: units,
            travelMode: travelMode,
            onUnitChange: this.handleUnitChange,
            onTravelModeChange: this.handleTravelModeChange
        }), /*#__PURE__*/ React.createElement(RouteList, {
            data: this.state.routes,
            travelMode: travelMode,
            units: units,
            onRouteClick: this.handleRouteClick
        }))));
    },
    displayName: "App"
});
var Icon = React.createClass({
    render: function render() {
        var type = this.props.type;
        var title = this.props.title;
        return(/*#__PURE__*/ React.createElement("svg", {
            title: title,
            className: "icon",
            dangerouslySetInnerHTML: {
                __html: '<use xlink:href="assets/icons.svg#icon-' + type + '"></use>'
            },
            width: this.props.width,
            height: this.props.height
        }));
    },
    displayName: "Icon"
});
var Map = React.createClass({
    getDefaultProps: function getDefaultProps() {
        return {
            map: {
                center: new google.maps.LatLng(37.7577, -122.4376),
                zoom: 12,
                disableDefaultUI: true
            }
        };
    },
    statics: {
        pinpointMarker: new google.maps.Marker({
            visible: false,
            clickable: false,
            zIndex: 1000
        }),
        showPinpointMarker: function showPinpointMarker(location) {
            this.pinpointMarker.setPosition(location);
            this.pinpointMarker.setVisible(true);
        },
        hidePinpointMarker: function hidePinpointMarker() {
            this.pinpointMarker.setVisible(false);
        }
    },
    componentDidMount: function componentDidMount() {
        var node = this.getDOMNode();
        var map = new google.maps.Map(node, this.props.map);
        Map.pinpointMarker.setMap(map);
        Steepless.directionsRenderer.setMap(map);
    },
    render: function render() {
        return(/*#__PURE__*/ React.createElement("div", {
            id: "map-canvas"
        }));
    },
    displayName: "Map"
});
var Chart = React.createClass({
    handleBarMouseEnter: function handleBarMouseEnter(index) {
        this.props.onBarMouseEnter(index);
    },
    handleBarMouseLeave: function handleBarMouseLeave() {
        this.props.onBarMouseLeave();
    },
    render: function render() {
        var self = this;
        var props = this.props;
        var chartStyle = {
            width: props.width,
            height: 0
        };
        var bars = '';
        if (props.data) {
            bars = props.data.map(function(d, i) {
                var style = {
                    borderBottomWidth: props.height * d.value / props.domain[1]
                };
                var key = i + '-' + d.value;
                return(/*#__PURE__*/ React.createElement("div", {
                    style: style,
                    key: key,
                    onMouseEnter: self.handleBarMouseEnter.bind(self, i),
                    onMouseLeave: self.handleBarMouseLeave
                }, /*#__PURE__*/ React.createElement("span", null, d.title)));
            });
            chartStyle.height = props.height; // then grow the height, CSS transition applied here
        }
        return(/*#__PURE__*/ React.createElement("div", {
            className: "chart",
            style: chartStyle
        }, bars));
    },
    displayName: "Chart"
});
var RouteForm = React.createClass({
    updateLocationHash: function updateLocationHash(travelMode, start, end) {
        if (!travelMode) travelMode = this.props.travelMode;
        if (!start) start = this.props.start;
        if (!end) end = this.props.end;
        if (!start || !end) return;
        location.hash = travelMode + '/' + encodeURIComponent(start) + '/' + encodeURIComponent(end);
    },
    handleSubmit: function handleSubmit() {
        var travelMode = this.refs.travelMode.getDOMNode().value;
        var start = this.refs.start.getDOMNode().value.trim();
        var end = this.refs.end.getDOMNode().value.trim();
        this.updateLocationHash(travelMode, start, end);
    },
    componentDidMount: function componentDidMount() {
        var startNode = this.refs.start.getDOMNode();
        var endNode = this.refs.end.getDOMNode();
        var start = startNode.value.trim();
        var end = endNode.value.trim();
        if (start && end) {
            if (this.props.start) startNode.value = this.props.start;
            if (this.props.end) endNode.value = this.props.end;
        }
        new google.maps.places.Autocomplete(startNode);
        new google.maps.places.Autocomplete(endNode);
    },
    componentWillReceiveProps: function componentWillReceiveProps() {
        if (this.props.travelMode) this.refs.travelMode.getDOMNode().value = this.props.travelMode;
        if (this.props.start) this.refs.start.getDOMNode().value = this.props.start;
        if (this.props.end) this.refs.end.getDOMNode().value = this.props.end;
    },
    handleTravelModeChange: function handleTravelModeChange() {
        var travelMode = this.refs.travelMode.getDOMNode().value;
        this.updateLocationHash(travelMode);
    },
    handleFlip: function handleFlip(e) {
        e.preventDefault();
        var start = this.refs.start.getDOMNode().value.trim();
        var end = this.refs.end.getDOMNode().value.trim();
        this.updateLocationHash(null, end, start);
    },
    handleDistanceChange: function handleDistanceChange() {
        var unit = this.refs.distanceSelect.getDOMNode().value;
        this.props.onUnitChange({
            distanceUnit: unit
        });
    },
    handleHeightChange: function handleHeightChange() {
        var unit = this.refs.heightSelect.getDOMNode().value;
        this.props.onUnitChange({
            heightUnit: unit
        });
    },
    render: function render() {
        var units = this.props.units;
        return(/*#__PURE__*/ React.createElement("form", {
            id: "directions-form",
            onSubmit: this.handleSubmit
        }, /*#__PURE__*/ React.createElement("div", {
            className: "field-section"
        }, /*#__PURE__*/ React.createElement("label", null, /*#__PURE__*/ React.createElement("select", {
            ref: "travelMode",
            onChange: this.handleTravelModeChange
        }, /*#__PURE__*/ React.createElement("option", {
            value: "walking"
        }, "Walking"), /*#__PURE__*/ React.createElement("option", {
            value: "bicycling"
        }, "Bicycling"), /*#__PURE__*/ React.createElement("option", {
            value: "driving"
        }, "Driving")), ' ', "from"), /*#__PURE__*/ React.createElement("input", {
            ref: "start",
            id: "directions-start",
            placeholder: "Start",
            required: true
        })), /*#__PURE__*/ React.createElement("a", {
            href: "#",
            id: "flip-direction",
            onClick: this.handleFlip,
            title: "Flip origin and destination",
            tabIndex: "-1"
        }, /*#__PURE__*/ React.createElement(Icon, {
            type: "arrow-right",
            width: "14",
            height: "14"
        })), /*#__PURE__*/ React.createElement("div", {
            className: "field-section"
        }, /*#__PURE__*/ React.createElement("label", {
            htmlFor: "directions-end"
        }, "To"), /*#__PURE__*/ React.createElement("input", {
            ref: "end",
            id: "directions-end",
            placeholder: "Destination",
            required: true
        })), /*#__PURE__*/ React.createElement("div", {
            className: "form-footer"
        }, /*#__PURE__*/ React.createElement("div", {
            className: "options"
        }, /*#__PURE__*/ React.createElement(Icon, {
            type: "widget",
            width: "20",
            height: "20",
            title: "Settings"
        }), /*#__PURE__*/ React.createElement("span", null, /*#__PURE__*/ React.createElement("label", null, "Distance\xa0", /*#__PURE__*/ React.createElement("select", {
            ref: "distanceSelect",
            value: units.distance,
            onChange: this.handleDistanceChange
        }, /*#__PURE__*/ React.createElement("option", {
            value: "km"
        }, "km"), /*#__PURE__*/ React.createElement("option", {
            value: "miles"
        }, "miles"))), "\xa0", /*#__PURE__*/ React.createElement("label", null, "Height\xa0", /*#__PURE__*/ React.createElement("select", {
            ref: "heightSelect",
            value: units.height,
            onChange: this.handleHeightChange
        }, /*#__PURE__*/ React.createElement("option", {
            value: "m"
        }, "m"), /*#__PURE__*/ React.createElement("option", {
            value: "ft"
        }, "ft"))))), /*#__PURE__*/ React.createElement("button", null, "Go"))));
    },
    displayName: "RouteForm"
});
var RouteList = React.createClass({
    handleClick: function handleClick(index) {
        this.props.onRouteClick(index);
    },
    handlePinpoint: function handlePinpoint(data) {
        this.props.onSetPinpoint(data);
    },
    render: function render() {
        var self = this;
        var data = this.props.data;
        if (data && data.length) {
            var routes = this.props.data.map(function(d, i) {
                var key = i + '' + d.route.bounds.toString();
                return(/*#__PURE__*/ React.createElement("li", {
                    key: key,
                    className: d.selected ? 'selected' : '',
                    onClick: self.handleClick.bind(self, i)
                }, /*#__PURE__*/ React.createElement(Route, {
                    data: d,
                    units: self.props.units,
                    travelMode: self.props.travelMode,
                    onSetPinpoint: self.handlePinpoint
                })));
            });
            return(/*#__PURE__*/ React.createElement("div", {
                id: "routes-container"
            }, /*#__PURE__*/ React.createElement("ul", {
                id: "routes-list"
            }, routes)));
        } else if (!!data) {
            return(/*#__PURE__*/ React.createElement("div", {
                id: "routes-container"
            }, /*#__PURE__*/ React.createElement("p", null, "Oops, there are no routes found.")));
        } else {
            return(/*#__PURE__*/ React.createElement("div", {
                id: "routes-container"
            }, /*#__PURE__*/ React.createElement("p", null, "Begin by entering the Start and Destination locations above."), /*#__PURE__*/ React.createElement("p", null, "Try an example:", ' ', /*#__PURE__*/ React.createElement("a", {
                href: "#walking/Chinatown, SF/Twin Peaks, SF"
            }, "Walking from Chinatown to Twin Peaks"))));
        }
    },
    displayName: "RouteList"
});
var Route = React.createClass({
    handleBarHover: function handleBarHover(index) {
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
        driving: 'car-side'
    },
    render: function render() {
        var data = this.props.data;
        var units = this.props.units;
        var route = data.route;
        var leg = route.legs[0];
        var distance = leg.distance.value;
        var width = Math.ceil(distance / Steepless.longestDistance * Steepless.chartWidth);
        var chartWidth = {
            width: width
        };
        var stats = data.stats;
        var domain = [
            0,
            Steepless.highestElevation
        ];
        var iconType = this.iconMap[this.props.travelMode];
        var height = Math.round((Steepless.highestElevation - Steepless.lowestElevation) / 2);
        var rise = null, drop = null, heightUnit = units.height;
        if (stats) {
            var statsRise = stats.rise, statsDrop = stats.drop;
            rise = Math.round(heightUnit == 'm' ? statsRise : statsRise * 3.28084) + ' ' + heightUnit;
            drop = Math.round(heightUnit == 'm' ? statsDrop : statsDrop * 3.28084) + ' ' + heightUnit;
        }
        var distanceUnit = units.distance;
        var distanceVal = leg.distance.value;
        var distance = (distanceUnit == 'km' ? distanceVal / 1000 : distanceVal * 0.000621371).toFixed(2) + ' ' + distanceUnit;
        var riseStat = rise ? /*#__PURE__*/ React.createElement("span", null, /*#__PURE__*/ React.createElement(Icon, {
            type: "arrow-graph-up-right",
            width: "14",
            height: "14",
            title: "Rise"
        }), ' ', rise) : '';
        var dropStat = drop ? /*#__PURE__*/ React.createElement("span", null, /*#__PURE__*/ React.createElement(Icon, {
            type: "arrow-graph-down-right",
            width: "14",
            height: "14",
            title: "Drop"
        }), ' ', drop) : '';
        var elevations = data.elevations ? data.elevations.map(function(d) {
            var elevation = d.elevation;
            return {
                value: elevation,
                title: Math.round(heightUnit == 'm' ? elevation : elevation * 3.28084) + ' ' + heightUnit
            };
        }) : null;
        return(/*#__PURE__*/ React.createElement("a", null, /*#__PURE__*/ React.createElement("div", {
            className: "heading"
        }, /*#__PURE__*/ React.createElement(Icon, {
            type: iconType,
            width: "24",
            height: "24",
            title: iconType
        }), ' ', "via ", route.summary), /*#__PURE__*/ React.createElement(Chart, {
            data: elevations,
            domain: domain,
            width: width,
            height: height,
            onBarMouseEnter: this.handleBarHover,
            onBarMouseLeave: this.handleBarHover
        }), /*#__PURE__*/ React.createElement("div", {
            className: "stats"
        }, riseStat, "\xa0\xa0\xa0", dropStat), /*#__PURE__*/ React.createElement("div", {
            className: "metadata"
        }, leg.duration.text, "\xa0\xa0\xa0", distance)));
    },
    displayName: "Route"
});
React.renderComponent(/*#__PURE__*/ React.createElement(App, null), document.getElementById('app'));


//# sourceMappingURL=steepless.js.map