Advanced use example of serverspec
==================================

This is an example of use of [serverspec][] with the following
additions:

 - host groups with a function classifier
 - parallel execution using a process pool
 - report generation (in JSON format)
 - report viewer

[serverspec]: http://serverspec.org/

[GoodData](http://www.gooddata.com/) also open sourced a
[more complete setup](https://github.com/gooddata/serverspec-core) and
moved the UI to a
[server-side component](https://github.com/gooddata/serverspec-ui)
which should be useful if you happen to have a lot of tests.

Currently, this has not been updated to
[Serverspec v2](http://serverspec.org/changes-of-v2.html).  There is a
`spec_helpver_v2.rb` which will allow testing of v2 functions located
in `spec/`

A tool similar to `serverspec` but with Python is
[Testinfra](https://testinfra.readthedocs.org/en/latest/).

First steps
-----------

Before using this example, you must provide your list of hosts in a
file named `hosts`. You can also specify an alternate list of files by
setting the `HOSTS` environment variable.

You also need to modify the `roles()` function at the top of the
`Rakefile` to derive host roles from their names. The current
classifier is unlikely to work as is.

To install the dependencies, use `bundle install --path .bundle`.

You can then run a test session:

    $ bundle exec rake spec

It is possible to only run tests on some hosts or to restrict to some
roles:

    $ bundle exec rake check:role:web
    $ bundle exec rake check:server:blm-web-22.example.com

Also note that `sudo` is disabled in `spec/spec_helper.rb`. You can
enable it globally or locally, like explained [here][1].

[1]: http://serverspec.org/advanced_tips.html

Classifier
----------

The classifier is currently a simple function (`roles()`) taking a
hostname as first parameter and returning an array of roles. A role is
just a string that should also be a subdirectory in the `spec/`
directory. In this subdirectory, you can put any test that should be
run for the given role. Here is a simple example of a directory
structure for three roles:

    spec
    ├── all
    │   ├── lldpd_spec.rb
    │   └── network_spec.rb
    ├── memcache
    │   └── memcached_spec.rb
    └── web
        └── apache2_spec.rb

Moreover, there is a `tags()` function whose purpose is to attach tags
to tests. Those tags are then made available for conditional
tests. You can do something like this with them:

    describe file('/data/images'), :tag => "paris" do
      it { should be_mounted.with( :type => 'nfs' ) }
    end

This test will only be executed if `paris` is one of the tags of the
current host.

Parallel execution
------------------

With many hosts and many tests, serial execution can take some
time. By using a pool of processes to run tests, it is possible to
speed up test execution. `rake` comes with builtin support of such
feature. Just execute it with `-j 10 -m`.

Reports
-------

Reports are automatically generated and put in `reports/` directory in
JSON format. They can be examined with a simple HTML viewer provided
in `viewer/` directory. Provide a report and you will get a grid view
of tests executed succesfully or not. By clicking on one result,
you'll get details of what happened, including the backtrace if any.

There is a task `reports:view` which triggers a WebRick HTTP server
on port 5000. Just open up http://localhost:5000/viewer to get quick
access to the generated reports.

There is a task `reports:gzip` which will gzip reports (and remove
empty ones). To be able to still use them without manual unzip, you
need a configuration like this in nginx to be able to serve them:

    server {
       listen 80;
       server_name serverspec.vbernat.deezerdev.com;

       location / {
          index index.html;
          root /path/to/serverspec/repo/viewer;
       }
       location /reports {
          autoindex on;
          root /path/to/serverspec/repo;
          gzip_static always;
          gzip_http_version 1.0;
          gunzip on;
       }
    }

If your version of nginx does not support `gunzip on`, you will
usually be fine without it...

License
-------

The code in this repository is distributed under the ISC license:

 > Permission to use, copy, modify, and/or distribute this software for any
 > purpose with or without fee is hereby granted, provided that the above
 > copyright notice and this permission notice appear in all copies.
 >
 > THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 > WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 > MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 > ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 > WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 > ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 > OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

However, the file `viewer/images/domokun.png` is not covered by this
license. Its whereabouts are unknown. You are free to replace it by an
image of your choice.
