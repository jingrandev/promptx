/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Geist',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans CJK SC',
          'Source Han Sans SC',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'system-ui',
          'sans-serif',
        ],
        mono: ['Geist Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(28, 25, 23, 0.12)',
      },
    },
  },
  plugins: [],
}
