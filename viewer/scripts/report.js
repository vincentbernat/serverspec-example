"use strict";

var reportResultsApp = angular.module("reportResultsApp", ['angularFileUpload', 'ui.bootstrap']);

reportResultsApp.controller("reportResultCtrl", [ "$scope", "$modal", function ($scope, $modal) {
    $scope.results = null;
    $scope.filename = null;

    // Upload
    $scope.onFileSelect = function($files) {
        var reader = new FileReader();
        var file = $files[0];
        reader.addEventListener("loadend", function() {
            $scope.$apply(function(scope) {
                scope.results = formatResults(JSON.parse(reader.result));
                scope.filename = file.name;
                console.log("Results have been extracted from " + scope.filename);
            });
        });
        reader.readAsBinaryString($files[0]);
    };

    // Details of a test
    $scope.details = function (hostname, result) {
        var modalInstance = $modal.open({
            templateUrl: "details.html",
            controller: "resultDetailsCtrl",
            resolve: {
                result: function() { return result; },
                hostname: function() { return hostname; }
            }
        });
    };
}]);

reportResultsApp.controller(
    "resultDetailsCtrl",
    [ "$scope", "$modalInstance", "result", "hostname",
      function ($scope, $modalInstance, result, hostname) {
          $scope.hostname = hostname;
          $scope.file_path = result.test.file_path;
          $scope.line_number = result.test.line_number;
          $scope.description = result.test.full_description;
          $scope.status = result.test.status;
          $scope.exception = result.test.exception;

          $scope.ok = function () {
              $modalInstance.dismiss('ok');
          };
      }]);

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
