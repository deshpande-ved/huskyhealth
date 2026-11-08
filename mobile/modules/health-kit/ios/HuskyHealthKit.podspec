# HuskyHealth's HealthKit module (local, iOS only). Same shape as ../../duo-display.
Pod::Spec.new do |s|
  s.name           = 'HuskyHealthKit'
  s.version        = '1.0.0'
  s.summary        = 'Workouts, heart rate and background sync from HealthKit, computed on the phone.'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'HuskyHealth'
  s.homepage       = 'https://huskyhealth.pages.dev'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
