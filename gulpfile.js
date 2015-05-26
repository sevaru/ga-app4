var browserify = require('browserify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var browserSync = require('browser-sync');
//var babelify = require("babelify");

gulp.task('browser-sync', function() {
    browserSync({
        server: {
            baseDir: "./"
        }
    });
});

gulp.task('browserify', function() {
    return browserify({
		entries: './src/js/boot.js',
		extensions: ['.hbs'],
		debug: true
	})
    /*.ignore("ABCJS")
    .transform(babelify)*/
    .bundle()
    //Pass desired output filename to vinyl-source-stream
    .pipe(source('bundle.js'))
    // Start piping stream to tasks!
    .pipe(gulp.dest('./build/'));
});

gulp.task('watch', function() {
	gulp.watch('./src/js/*.js', ['reload']);
    gulp.watch('./src/templates/*.hbs', ['reload']);
	gulp.watch('index.html', ['reload']);
});

gulp.task('reload', ['browserify'], function() {
    browserSync.reload();
});

gulp.task('default', ['watch', 'reload', 'browser-sync']);