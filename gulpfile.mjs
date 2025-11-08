/* jshint node:true */

import gulp from 'gulp';
import path from 'path';
import { fileURLToPath } from 'url';
import copy from 'gulp-copy';
import notify from 'gulp-notify';
import uglifycss from 'gulp-uglifycss';
import terser from 'gulp-terser';
import fs from 'fs';
import plumber from 'gulp-plumber';
import sourcemaps from 'gulp-sourcemaps';
import zip from 'gulp-zip';
import concat from 'gulp-concat';

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import JSON files
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const manifest = require('./manifest.json');

const popupJS = [
  'lib/controller_communicator.js',
  'lib/utils.js',
  'popup.js'
];
const optionsCSS = [ 'chrome-bootstrap.css', 'options.css' ];
const optionsJS = [
  'lib/jsrender.min.js',
  'lib/utils.js',
  'lib/controller_communicator.js',
  'options.js'
];
const contentJS = manifest.content_scripts[0].js;
const contentCSS = manifest.content_scripts[0].css;

function buildCSS( src, destFile ) {
  return gulp.src( src )
    .pipe( uglifycss( { uglyComments: true } ) )
    .pipe( concat( destFile ) )
    .pipe( gulp.dest( './build/' ) )
    .pipe( notify( {
      title: 'Gulp',
      message: 'Built ' + destFile,
      onLast: true
    } ) );
}

function buildJS ( src, destFile ) {
  return gulp.src( src )
    .pipe( plumber( {
      errorHandler: notify.onError( function ( error ) {
        return error.name + ': ' + error.message + '\n' + (error.cause ? error.cause.filename + '[' + error.cause.line + ':' + error.cause.col + '] ' + error.cause.message : '');
      } )
    } ) )
    .pipe( sourcemaps.init() )
    .pipe( terser() )
    .pipe( plumber.stop() )
    .pipe( concat( destFile ) )
    .pipe( sourcemaps.write( 'maps' ) )
    .pipe( gulp.dest( './build/' ) )
    .pipe( notify( {
      title: 'Gulp',
      message: 'Built: ' + destFile,
      onLast: true
    } ) );
}

function copyProjectFiles ( ) {
  // Reload manifest.json
  delete require.cache[ path.resolve( './manifest.json' ) ];
  const manifest = require( './manifest.json' );
  manifest.content_scripts[ 0 ].css = [ 'content.min.css' ];
  manifest.content_scripts[ 0 ].js = [ 'content.min.js' ];
  manifest.background.service_worker = 'background.min.js';

  if ( !fs.existsSync( './build' ) ) {
    fs.mkdirSync( './build' );
  }
  fs.writeFileSync( './build/manifest.json', JSON.stringify( manifest, null, 2 ) );

  // Create lib/images if it doesn't exist
  if ( !fs.existsSync( './lib/images' ) ) {
    fs.mkdirSync( './lib/images', { recursive: true } );
  }

  return gulp.src( [
    'README.md',
    './images/**/*',
    './_locales/**/*',
    'options.html',
    'popup.html',
    './lib/images/**/*'
  ], { allowEmpty: true } )
    .pipe( copy( './build/' ) )
    .pipe( gulp.dest( './' ) )
    .pipe( notify( {
      title: 'Gulp',
      message: 'Copied project files',
      onLast: true
    } ) );
}

function createDistributionZip () {
  const version = require( './build/manifest.json' ).version;
  const zipFileName = `DelugeFlow-${version}.zip`;

  return gulp.src( 'build/**/*' )
    .pipe( zip( zipFileName ) )
    .pipe( gulp.dest( 'dist' ) )
    .pipe( notify( {
      title: 'Gulp',
      message: 'Packaged...',
      onLast: true
    } ) );
}

function buildContentCSS () {
  return buildCSS( contentCSS, 'content.min.css' )
}

function buildContentJS () {
  return buildJS( contentJS, 'content.min.js' )
}

function buildOptionsJS () {
  return buildJS( optionsJS, 'options.min.js' )
}

function buildOptionsCSS () {
  return buildCSS( optionsCSS, 'options.min.css' )
}

function buildBackgroundJS () {
  return buildJS( ['background.js'], 'background.min.js' )
}

function buildPopupJS () {
  return buildJS( popupJS, 'popup.min.js' )
}

function watch () {
  gulp.watch( contentCSS, buildContentCSS );
  gulp.watch( contentJS, buildContentJS );
  gulp.watch( optionsJS, buildOptionsJS );
  gulp.watch( optionsCSS, buildOptionsCSS );
  gulp.watch( ['background.js'], buildBackgroundJS );
  gulp.watch( popupJS, buildPopupJS );
  gulp.watch( [ '*.json', '*.html', '_locales/**/*', 'images/**/*', 'lib/images/**/*' ], copyProjectFiles );
}

/* task exports */
const build = gulp.series( gulp.parallel( buildContentCSS, buildContentJS, buildBackgroundJS, buildPopupJS, buildOptionsCSS, buildOptionsJS ), copyProjectFiles );

// Gulp 3 compatible task registration
gulp.task('watch', watch);
gulp.task('build', build);
gulp.task('default', build);
gulp.task('package', createDistributionZip);

// Also keep exports for Gulp 4 CLI
export { watch, build, createDistributionZip as package };
export default build;
