/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#FF902F',
          coral: '#FC6075',
          navy: '#002D62',
          dark: '#1E293B',
          darker: '#0F172A'
        },
        status: {
          present: {
            text: '#065F46',
            bg: '#D1FAE5',
            border: '#A7F3D0'
          },
          night: {
            text: '#3730A3',
            bg: '#E0E7FF',
            border: '#C7D2FE'
          },
          off: {
            text: '#991B1B',
            bg: '#FEE2E2',
            border: '#FECACA'
          },
          weekend: {
            text: '#5B21B6',
            bg: '#EDE9FE',
            border: '#DDD6FE'
          },
          leave: {
            text: '#1E40AF',
            bg: '#DBEAFE',
            border: '#BFDBFE'
          },
          unpaid: {
            text: '#475569',
            bg: '#F1F5F9',
            border: '#E2E8F0'
          },
          sick: {
            text: '#9D174D',
            bg: '#FCE7F3',
            border: '#FBCFE8'
          },
          paid: {
            text: '#065F46',
            bg: '#CCFBF1',
            border: '#99F6E4'
          },
          holiday: {
            text: '#D97706',
            bg: '#FEF3C7',
            border: '#FDE68A'
          },
          trip: {
            text: '#075985',
            bg: '#E0F2FE',
            border: '#BAE6FD'
          }
        },
        ot: {
          pending: {
            bg: '#FEF3C7',
            text: '#92400E',
            border: '#FDE68A'
          },
          verified: {
            bg: '#D1FAE5',
            text: '#065F46',
            border: '#A7F3D0'
          },
          mismatch: {
            bg: '#FEE2E2',
            text: '#991B1B',
            border: '#FECACA'
          }
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
