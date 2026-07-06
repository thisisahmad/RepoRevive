/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0F',
        surface: '#12121A',
        'surface-elevated': '#1A1A24',
        border: '#2A2A3A',
        'border-subtle': '#1E1E2E',
        foreground: '#F4F4F5',
        muted: '#A1A1AA',
        'muted-dark': '#71717A',
        accent: {
          DEFAULT: '#14F5C6',
          dim: '#0DB896',
          glow: 'rgba(20, 245, 198, 0.4)',
          muted: 'rgba(20, 245, 198, 0.12)',
        },
        error: '#FF4D6A',
        success: '#14F5C6',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        hero: 'clamp(3rem, 8vw, 7rem)',
        'display-lg': 'clamp(2.25rem, 5vw, 4rem)',
        'display-md': 'clamp(1.75rem, 3.5vw, 2.75rem)',
        'display-sm': 'clamp(1.25rem, 2vw, 1.75rem)',
      },
      spacing: {
        section: 'clamp(5rem, 12vw, 10rem)',
      },
      maxWidth: {
        content: '1200px',
        wide: '1400px',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 40px rgba(20, 245, 198, 0.15)',
        'glow-lg': '0 0 60px rgba(20, 245, 198, 0.25)',
        'glow-accent': '0 0 20px rgba(20, 245, 198, 0.5)',
        card: '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-gradient':
          'radial-gradient(at 40% 20%, rgba(20, 245, 198, 0.08) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(20, 245, 198, 0.05) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(20, 245, 198, 0.06) 0px, transparent 50%)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
