"use strict";

var reportResultsApp = angular.module("reportResultsApp", ['ngRoute', 'angularFileUpload', 'ui.bootstrap']);

reportResultsApp.config([ "$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode(false);
    $routeProvider.
        when("/upload", {
            templateUrl: "upload.html",
            controller: "uploadCtrl",
            resolve: {
                files: ["$route", "AvailableReports", function($route, AvailableReports) {
                    return AvailableReports.fetch($route.current.params.url);
                }]
            }
        }).

        when("/url/:url*", {
            templateUrl: "result.html",
            controller: "reportResultCtrl",
            resolve: {
                filename: ["$route", function($route) {
                    return $route.current.params.url;
                }],
                data: ["$http", "$route", function($http, $route) {
                    console.info("Loading from " + $route.current.params.url);
                    return $http({ method: "GET",
                                   url: $route.current.params.url }).then(function(response) {
                                       return response.data;
                                   }, function() { return null });
                }]
            }
        }).

        when("/file/:filename*", {
            templateUrl: "result.html",
            controller: "reportResultCtrl",
            resolve: {
                filename: ["$route", function($route) {
                    return $route.current.params.filename;
                }],
                data: ["$route", "ResultData", function($route, ResultData) {
                    var data = ResultData.fetch();
                    console.info("Loading from local file " + $route.current.params.filename);
                    return data;
                }]
            }
        }).

        otherwise({
            redirectTo: "/upload"
        });
}]);

reportResultsApp.factory("AvailableReports", [ "$http", function($http) {
    return {
        "fetch": function(directory) {
            directory = directory || "../reports/";
            console.info("Loading available JSON files from " + directory);
            return $http({ method: "GET",
                           url: directory }).then(function(response) {
                               // Extract URL from HTML source code
                               var re = /a href="([^"]+\.json)(\.gz)?"/g;
                               var files = [];
                               var partial;
                               while ((partial = re.exec(response.data)) !== null) {
                                   files.push(partial[1]);
                               }
                               // We assume that the files are already sorted
                               return _.sortBy(_.map(files, function(file) {
                                   var a = document.createElement('a');
                                   a.href = directory + file;
                                   return {
                                       path: a.href,
                                       name: decodeURIComponent(file)
                                   };
                               }), function(file) {
                                   // We extract the date and sort through that
                                   var mo = file.name.match(/--(.+)\.json$/);
                                   var date = mo?mo[1]:"1970-01-01T01:00:00";
                                   return date + "---" + file;
                               }).reverse();
                           }, function() { return [] });
        }
    };
}]);

// We use this service to pass data between upoadCtrl and reportResultCtrl
reportResultsApp.factory("ResultData", function() {
    var current = null;
    return {
        "save": function(data) { current = data; return current; },
        "fetch": function() { return current }
    };
});

reportResultsApp.controller("uploadCtrl", [ "$scope", "$location", "ResultData", "files", function($scope, $location, ResultData, files) {
    // Select a file
    $scope.files = files;
    $scope.visit = function(file) {
        $location.path("/url/" + file);
    };

    // Upload a file
    $scope.onFileSelect = function($files) {
        var reader = new FileReader();
        var file = $files[0];
        reader.addEventListener("loadend", function() {
            $scope.$apply(function(scope) {
                var input = JSON.parse(reader.result);
                ResultData.save(input);
                $location.path("/file/" + file.name);
            });
        });
        reader.readAsBinaryString($files[0]);
    };

    // Load an URL
    $scope.load = function() {
        var target = "/url/" + encodeURI($scope.url);
        $location.path("/url/" + $scope.url);
    }
}]);

reportResultsApp.controller("reportResultCtrl", [ "$scope", "$modal", "$location", "data", "filename", function($scope, $modal, $location, data, filename) {
    if (data === null) {
        console.warn("No data available, go back to upload");
        $location.path("/");
    } else {
        $scope.results = formatResults(data.tests);
        $scope.sources = data.sources;
        $scope.filename = filename;
    }

    // Transform a status in a mark
    $scope.mark = function(status) {
        return {
            "failed": "✗",
            "passed": "✓"
        }[status] || "";
    }

    // Details of a test
    $scope.details = function (hostname, result) {
        var modalInstance = $modal.open({
            templateUrl: "details.html",
            windowClass: "wider-modal",
            controller: [ "$scope", "$modalInstance", "result", "hostname", "source",
                          function ($scope, $modalInstance, result, hostname, source) {
                              $scope.hostname = hostname;
                              $scope.file_path = result.test.file_path;
                              $scope.line_number = result.test.line_number;
                              $scope.description = result.test.full_description;
                              $scope.status = result.test.status;
                              $scope.exception = result.test.exception;
                              $scope.source_start = source.start;
                              $scope.source_snippet = source.snippet.join("\n");

                              $scope.ok = function () {
                                  $modalInstance.dismiss('ok');
                              };
                          }],
            resolve: {
                result: function() { return result; },
                hostname: function() { return hostname; },
                source: function() {
                    // Extract the appropriate source snippet.
                    var file = result.test.file_path;
                    var start = result.test.line_number;
                    var end = result.test.line_number;
                    var source = $scope.sources[file];
                    // We search for the first blank lines followed by a non-idented line
                    while (start > 1 &&
                           (source[start - 1] !== "" ||
                            (source[start] || "").match(/^\s/) !== null)) start--;
                    while (source[end - 1] !== undefined &&
                           (source[end - 1] !== "" ||
                            (source[end - 2] || "").match(/^\s/) !== null)) end++;
                    start++; end--;
                    return {
                        "start": start,
                        "snippet": source.slice(start - 1, end)
                    }
                }
            }
        });
    };

}]);

reportResultsApp.directive(
    "rrTooltip", [ "$compile", function($compile) {
        return {
            restrict: 'A',
            scope: {
                content: '@rrTooltip'
            },
            link: function(scope, element, attr) {
                element.on("mouseenter", function(event) {
                    // Only now, we will build the new element
                    // with the tooltip if it doesn't exist (or
                    // doesn't match the tooltip)
                    var inside = element.children();
                    if (!inside.length) {
                        inside = angular.element("<span>");
                    }
                    if (inside.attr("tooltip") === scope.content) return;
                    inside.attr("tooltip-placement", "left");
                    inside.attr("tooltip", scope.content);
                    inside.html(element.html())

                    // And insert it
                    var compiled = $compile(inside);
                    var linked = compiled(scope);
                    element.empty();
                    element.append(linked);
                });
            }
        }
    }
]);

reportResultsApp.directive(
    "prettyprint", function() {
        return {
            scope: false,
            replace: true,
            restrict: 'E',
            template: '<pre class="prettyprint"></pre>',
            controller: function($scope, $element) {
                $element.html(prettyPrintOne($scope.source_snippet,
                                             "ruby",
                                             $scope.source_start));
                angular.element($element
                                .removeClass("highlighted")
                                .find("li")[$scope.line_number - $scope.source_start])
                    .addClass("highlighted");
            }
        };
    });

// Format results to display them more effectively
var formatResults = function(input) {

    console.group("Formatting results");

    // Input is something like that:
    // [{ "hostname": "....",
    //    "results": { "examples": [
    //          { "description": "should ...",
    //            "file_path": "./spec/role/something_spec.rb",
    //            "full_description": "Squid should ...",
    //            "line_number": 4,
    //            "status": "passed" },
    //          { ... } ] } },
    //  { ... }]

    // We want to display something like this:
    //
    //           |  all   |  web   |
    //  ------------------------------------
    //    web1   | ✓ ✗ ✓  | ✓ ✓ ✓  |
    //    web2   | ✓ ✗ ✓  | ✓ ✓ ✓  |
    //    web3   | ✓ ✗    | ✓ ✓ ✓  |
    //  ------------------------------------
    //           |  all   |  memcache   |
    //  ------------------------------------
    //    memc1  | ✓ ✓ ✓  | ✓ ✓ ✓ ✓ ✓ ✓ |
    //    memc2  | ✓ ✓ ✓  | ✓     ✓     |
    //    memc3  | ✓ ✓ ✓  | ✓ ✓ ✓ ✓     |
    //  ------------------------------------
    //           |
    //  ------------------------------------
    //    unkn1  |
    //    unkn2  |

    // So, we need to extract:
    //
    //   1. The set of roles. In the example above, this is
    //      (all, web), (all, memcache) and ().
    //
    //   2. For each set, get the list of hosts in the set. We should
    //      be able to attach the number of succesfull/failed tests to
    //      be able to display them as overlay or as a background
    //      color.
    //
    //   3. For each role in each set, we should be able to have the
    //      number of tests to be displayed.
    //
    //   4. For each host, for each role, for each spec file in the
    //      role (even those not executed for this specific host), for
    //      test in spec file (even those not executed), we need to
    //      know the status, the description. The order should be the
    //      same for each host, including the tests not run. We need
    //      to ensure that a given column for a role set is always the
    //      same test.
    //
    // In output, we get (this is a flattened output to allow easy
    // iteration in AngularJS):
    //
    // [ { "roles": [ {name: "all", tests: 5 },
    //                {name: "web", tests: 10 } ],
    //     "specs": [ {role: "all", name: "lldpd", tests: 5},
    //                {role: "web", name: "apache2", tests: 10 }],
    //     "results": [ {name: "web1", success: 14, failure: 1,
    //                   results: [{role: "all",
    //                              spec: "lldpd",
    //                              test: {status: "failed",
    //                                     line_number: 4,
    //                                     full_description: "...",
    //                                     exception: {...}}]

    var output = [];

    // Get example identifier (role, spec, line number)
    var exampleIdentifier = function (e) {
        var matches = e.file_path.match(/^\.\/spec\/([^\/]+)\/([^\/]+)_spec\.rb$/);
        if (matches) {
            return [ matches[1], matches[2], e.line_number ];
        }
    };

    // Get role attached to an example
    var exampleRole = function (e) {
        var id = exampleIdentifier(e);
        if (id) {
            return id[0];
        }
    };

    // Get roles attached to a result
    var resultRoles = function(r) {
        return _.uniq(_.map(r.results.examples, exampleRole),
                      function(x) { return JSON.stringify(x); });
    };

    // Display string for a role set
    var roleSetName = function(rs) {
        return "(" + rs.join(", ") + ")";
    };

    // Affect a color depending on the number of success and failures
    var successColor = function(success, failure) {
        if (success + failure === 0) {
            return "black";
        }
        var percent = success / (success + failure*5); // failures are more important
        // #32cd32
        var color1 = [ 0x32, 0xcd, 0x32 ];
        // #ff6347
        var color2 = [ 0xff, 0x63, 0x47 ];
        var target = _.zip(_.map(color1, function(x) { return x*percent }),
                           _.map(color2, function(x) { return x*(1-percent) }));
        target = _.map(target, function(x) {
            var r = x[0] + x[1];
            var s = Math.round(r).toString(16);
            return s.length == 2 ? s : '0' + s;
        });
        return "#" + target.join("");
    };

    // Provides result for a given test
    var testResult = function(examples, test) {
        var ts = JSON.stringify(test);
        var example = _.find(examples, function(e) {
            return JSON.stringify(exampleIdentifier(e)) === ts;
        });
        if (!example) return { "status": "missing" };
        return example;
    };

    // Set of roles.
    var roleSets = _.sortBy(
        _.uniq(_.map(input, resultRoles),
               function(x) { return JSON.stringify(x); }),
        function(a) { return -a.length });
    console.group(roleSets.length + " role sets");
    _.each(roleSets, function (rs) { console.log(roleSetName(rs)); });
    console.groupEnd();

    _.each(roleSets, function(rs) {
        console.group("Process role set " + roleSetName(rs));

        // We need to get a list of all tests in a topological order
        // for the current roleset. A test is a role, a spec file and
        // a line number.
        var tests = _.map(input, function(r) {
            // Keep only examples that match our roleset
            var examples = _.filter(r.results.examples, function(e) {
                return _.indexOf(rs, exampleRole(e)) != -1
            });
            return _.map(examples, exampleIdentifier);
        });

        // Our topological sort can be done with a simple sort as we
        // have everything we need.
        tests = _.flatten(tests, true);
        tests = _.uniq(tests, function(x) { return JSON.stringify(x); });
        tests = _.filter(tests, function(t) { return t.length > 0; });
        tests.sort(function(t1, t2) {
            if (t1[0] < t2[0]) return -1;
            if (t1[0] > t2[0]) return 1;
            if (t1[1] < t2[1]) return -1;
            if (t1[1] > t2[1]) return 1;
            if (t1[2] < t2[2]) return -1;
            if (t1[2] > t2[2]) return 1;
            return 0;
        });

        console.log("Tests are: ", _.map(tests, function(t) {
            return t.join(":");
        }));

        // List of roles with the number of tests
        var roles = _.map(_.groupBy(tests, function(t) { return t[0]; }),
                          function (tests, role) {
                              return { "name": role,
                                       "tests": tests.length,
                                       "specs":  _.map(_.groupBy(tests, function(t) { return t[1]; }),
                                                       function (tests, spec) {
                                                           return { "name": spec,
                                                                    "tests": tests.length };
                                                       })};
                          });
        var specs = _.flatten(_.map(roles, function(role) {
            var sp = role.specs;
            delete role.specs;
            _.map(sp, function(s) { s.role = role.name; });
            return sp;
        }), true);

        // Results for each host (not very efficient)
        var results = _.filter(input, function(h) {
            return JSON.stringify(resultRoles(h)) === JSON.stringify(rs)
        });
        results = _.map(results, function(h) {
            var success = 0;
            var failure = 0;
            var rr = _.map(_.groupBy(tests, function(t) { return t[0]; }),
                           function (tests, role) {
                               return _.map(_.groupBy(tests, function(t) { return t[1]; }),
                                            function(tests, spec) {
                                                var res = _.map(tests, function (t) {
                                                    return testResult(h.results.examples, t);
                                                });
                                                failure += _.reduce(res,
                                                                    function (memo, r) {
                                                                        return memo + ((r.status === "failed")?1:0);
                                                                    }, 0);
                                                success += _.reduce(res,
                                                                    function (memo, r) {
                                                                        return memo + ((r.status === "passed")?1:0);
                                                                    }, 0);
                                                return _.map(res, function(r) {
                                                    return {
                                                        "role": role,
                                                        "spec": spec,
                                                        "test": r
                                                    };
                                                })
                                            });
                           });
            return { "name": h.hostname,
                     "success": success,
                     "failure": failure,
                     "color": successColor(success, failure),
                     "results": _.flatten(rr) };
        });

        output.push({"roles": roles,
                     "specs": specs,
                     "results": results,
                     "tests": tests.length});
        console.groupEnd();
    });

    console.groupEnd();
    return output;
}
