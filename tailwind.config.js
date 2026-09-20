export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', 'cursive'],
        pixel: ['"Press Start 2P"', 'cursive'],
      },
      colors: {
        typeFire: '#f87171',
        typeWater: '#60a5fa',
        typeGrass: '#4ade80',
        typeElectric: '#facc15',
      },
      screens: {
        tv: '1920px',
      },
    },
  },
  plugins: [],
};
