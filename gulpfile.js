var gulp = require('gulp');
var react = require('gulp-react');
var watch = require('gulp-watch');
var webserver = require('gulp-webserver');

gulp.task('webserver', function(){
	gulp.src('.')
		.pipe(webserver());
});

gulp.task('react', function(){
	gulp.src('assets/steepless.jsx')
		.pipe(watch(function(files){
			files.pipe(react())
				.pipe(gulp.dest('assets'));
		}));
});

gulp.task('default', ['webserver', 'react']);