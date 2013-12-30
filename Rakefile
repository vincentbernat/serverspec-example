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
  return roles
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
        t.target = host[:name]
        t.pattern = './spec/{' + host[:roles].join(",") + '}/*_spec.rb'
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
  desc "Clean up old reports"
  task :clean do
    FileUtils.rm_rf "#{$REPORTS}/current"
  end

  desc "Build final report"
  task :build do
    now = Time.now
    fname = "#{$REPORTS}/run-%s.json" % [ now.strftime("%Y-%m-%dT%H:%M:%S") ]
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

check_tasks = Rake.application.top_level_tasks.select { |task|
  task.start_with?("check:") or task == "spec"
}
if not check_tasks.empty? then
  # Before starting, cleanup reports
  Rake::Task[check_tasks.first].enhance [ "reports:clean" ]

  # Build final report
  Rake::Task[check_tasks.last].enhance do
    Rake::Task["reports:build"].invoke
  end
end
