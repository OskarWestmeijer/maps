/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('daisyui'),],
  daisyui: {
    themes: [
      // set theme in index.html: data-theme="customtheme"
      'synthwave',
      'cupcake',
      {
        customtheme: {
          // Navy #0a192f
          // light navy #112240
          // lightest navy #233554
          // Green #64ffda
          primary: '#233554',
          secondary: '#233554',
          accent: '#ffd200',
          'accent-focus': '#ffffff',
          neutral: '#191a3e',
          'base-100': '#ffffff',
          info: '#cae2e8',
          success: '#dff2a1',
          warning: '#f7e488',
          error: '#f2b6b5'
        }
      }
    ]
  }

}