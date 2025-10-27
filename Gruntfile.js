module.exports = function(grunt) {
  grunt.initConfig({
    nwabap_ui5uploader: {
      upload: {
        options: {
          conn: {
            server: 'https://intadsgwd01:44300/',
            client: '080',
            useStrictSSL: false
          },
          auth: {
            user: 'exdevind',
            pwd: 'Arjas@101010'
          },
          ui5: {
            package: 'ZODATA_BW',
            bspcontainer: 'ZSD_ANNUALBP',
            bspcontainer_text: 'Sales Dashboard - OSP Data Vs Actual',
            transportno: 'GWDK900179'
          },
          resources: {
            cwd: 'dist',
            src: '**/*.*'
          }
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-nwabap-ui5uploader');
};
