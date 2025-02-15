module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}', // Scan all React components inside frontend
  ],
  theme: {
    extend: {
      colors: {
        peacockTeal: '#00b3b3',
        peacockGreen: '#009966',
        peacockPurple: '#4b0082',
        dashboardDark: '#1a1a2e',
        dashboardPrimary: '#0f3460',
        dashboardAccent: '#e94560',
        dashboardText: '#f5f5f5',
      },
      backgroundSize: {
        'gradient-200': '400% 400%',
      },
      animation: {
        gradient: 'gradientAnimation 8s ease infinite',
      },
      keyframes: {
        gradientAnimation: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
};
