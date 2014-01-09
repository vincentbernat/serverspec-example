require 'rake'
require 'rspec/core/rake_task'
require 'colorize'
require 'json'

$HOSTS    = "./hosts"           # List of all hosts
$REPORTS  = "./reports"         # Where to store JSON reports

# Return all roles of a given host
def roles(host)
  roles = [ "all" ]
  case host
  when /^blm-web-/
    roles << "web"
  when /^blm-memc-/
    roles << "memcache"
  when /^blm-lb-/
    roles << "lb"
  when /^blm-bigdata-/
    roles << "bigdata"
  when /^blm-proxy-/
    roles << "proxy"
  end
  roles
end


# Special version of RakeTask for serverspec which comes with better
# reporting
class ServerspecTask < RSpec::Core::RakeTask

  attr_accessor :target

  # Run our serverspec task. Errors are ignored.
  def run_task(verbose)
    json = "#{$REPORTS}/current/#{target}.json"
    @rspec_opts = ["--format", "json", "--out", json]
    system("env TARGET_HOST=#{target} #{spec_command}")
    status(target, json) if verbose
  end

  # Display status of a test from its JSON output
  def status(target, json)
    begin
      out = JSON.parse(File.read(json))
      summary = out["summary"]
      total = summary["example_count"]
      failures = summary["failure_count"]
      if failures > 0 then
        print ("[%-3s/%-4s] " % [failures, total]).yellow, target, "\n"
      else
        print "[OK      ] ".green, target, "\n"
      end
    rescue Exception => e
      print "[ERROR   ] ".red, target, " (#{e.message})", "\n"
    end
  end

end

hosts = File.foreach(ENV["HOSTS"] || $HOSTS)
  .map { |line| line.strip }
  .map do |host|
  {
    :name => host.strip,
    :roles => roles(host.strip),
  }
end

desc "Run serverspec to all hosts"
task :spec => "check:server:all"

namespace :check do

  # Per server tasks
  namespace :server do
    desc "Run serverspec to all hosts"
    task :all => hosts.map { |h| h[:name] }
    hosts.each do |host|
      desc "Run serverspec to host #{host[:name]}"
      ServerspecTask.new(host[:name].to_sym) do |t|
        dirs = host[:roles] + [ host[:name] ]
        t.target = host[:name]
        t.pattern = './spec/{' + dirs.join(",") + '}/*_spec.rb'
      end
    end
  end

  # Per role tasks
  namespace :role do
    roles = hosts.map {|h| h[:roles]}
    roles = roles.flatten.uniq
    roles.each do |role|
      desc "Run serverspec to role #{role}"
      task "#{role}" => hosts.select { |h| h[:roles].include? role }.map {
        |h| "check:server:" + h[:name]
      }
    end
  end
end

namespace :reports do
  desc "Clean up old partial reports"
  task :clean do
    FileUtils.rm_rf "#{$REPORTS}/current"
  end

  desc "Clean reports without results"
  task :housekeep do
    FileList.new("#{$REPORTS}/*.json").map { |f|
      content = File.read(f)
      if content.empty?
        # No content, let's remove it
        f
      else
        results = JSON.parse(content)
        if not results.include?("tests") or results["tests"].map { |t|
            if t.include?("results") and
                t["results"].include?("examples") and
                not t["results"]["examples"].empty?
              t
            end
          }.reject { |c| c == nil }.empty?
          f
        end
      end
    }.reject { |c| c == nil }.each { |f|
      FileUtils.rm f
    }
  end

  desc "Gzip all reports"
  task :gzip do
    FileList.new("#{$REPORTS}/*.json").each { |f|
      system "gzip", f
    }
  end
  task :gzip => "housekeep"

  desc "Build final report"
  task :build, :tasks do |t, args|
    args.with_defaults(:tasks => [ "unspecified" ])
    now = Time.now
    fname = "#{$REPORTS}/%s--%s.json" % [ args[:tasks].join("-"), now.strftime("%Y-%m-%dT%H:%M:%S") ]
    File.open(fname, "w") { |f|
      # Test results
      tests = FileList.new("#{$REPORTS}/current/*.json").sort.map { |j|
        content = File.read(j).strip
        {
          :hostname => File.basename(j, ".json"),
          :results => JSON.parse(content.empty? ? "{}" : content)
        }
      }.to_a
      # Relevant source files
      sources = FileList.new("#{$REPORTS}/current/*.json").sort.map { |j|
        content = File.read(j).strip
        results = JSON.parse(content.empty? ? '{"examples": []}' : content)["examples"]
        results.map { |r| r["file_path"] }
      }.to_a.flatten(1).uniq
      sources = sources.each_with_object(Hash.new) { |f, h|
        h[f] = File.readlines(f).map { |l| l.chomp }.to_a
      }
      f.puts JSON.generate({ :version => 1,
                             :tests => tests,
                             :sources => sources })
    }
  end
end

# Before starting any task, cleanup reports
all_check_tasks = Rake.application.tasks.select { |task|
  task.name.start_with?("check:")
}
all_check_tasks.each { |t|
  t.enhance [ "reports:clean" ]
}

# Build final report only after last check
running_check_tasks = Rake.application.top_level_tasks.select { |task|
  task.start_with?("check:") or task == "spec"
}
if not running_check_tasks.empty? then
  Rake::Task[running_check_tasks.last].enhance do
    Rake::Task["reports:build"].invoke(running_check_tasks)
  end
  running_check_tasks.each { |t|
    task "reports:build" => t
  }
end
