module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        watch: {
            scripts: {
                files: ['js/*.js'],
                options: {
                    spawn: false,
                    livereload: true
                }
            },
            css: {
                files: ['css/*.css'],
                options: {
                    spawn: false,
                    livereload: true
                }
            },
            json: {
                files: ['*.json'],
                options: {
                    spawn: false,
                    livereload: true
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-watch');

    // Default task(s).
    grunt.registerTask('default', ['watch']);

};