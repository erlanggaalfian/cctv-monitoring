// Unified Tailwind Play CDN config for CCTV Monitoring frontend.
// MUST be loaded AFTER assets/js/tailwind.js (that script creates the
// global `tailwind` object; this file only assigns its .config).
// Single source of truth: shared by includes/header.php and login.php.
// Colors kept in sync with assets/css/global.css (brand.navy = --brand-navy).
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Montserrat', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
                heading: ['Poppins', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
                mono: ['Montserrat', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
            },
            colors: {
                brand: {
                    blue:     '#3081d1',
                    orange:   '#F26935',
                    navy:     '#1a2a4a',
                    'blue-h': '#1e68be',
                    'navy-h': '#1e3d6b',
                },
                cyber: {
                    bg:        '#080c12',
                    container: '#0f1520',
                    hover:     '#141c2b',
                    highest:   '#1a2438',
                    text:      '#dde5f4',
                    dim:       '#7a8faa',
                    outline:   'rgba(48,129,209,0.14)',
                    primary:   '#3081d1',
                    secondary: '#F26935',
                    accent:    '#F26935',
                    error:     '#ef4444',
                },
                sky: {
                    50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                    300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                    600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                    900: '#193a5f', 950: '#11253d',
                },
                emerald: {
                    50:  '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
                    300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
                    600: '#059669', 700: '#047857', 800: '#065f46',
                    900: '#064e3b', 950: '#022c22',
                },
                green: {
                    50:  '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
                    300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
                    600: '#059669', 700: '#047857', 800: '#065f46',
                    900: '#064e3b', 950: '#022c22',
                },
                rose: {
                    50:  '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                    300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
                    600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
                    900: '#7f1d1d', 950: '#450a0a',
                },
                red: {
                    50:  '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                    300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
                    600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
                    900: '#7f1d1d', 950: '#450a0a',
                },
                amber: {
                    50:  '#fef5f0', 100: '#fde8dd', 200: '#fbcfba',
                    300: '#f8ad8c', 400: '#f58a5e', 500: '#F26935',
                    600: '#d9521f', 700: '#b43f18', 800: '#8f3416',
                    900: '#742d15', 950: '#3f1408',
                },
                indigo: {
                    50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                    300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                    600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                    900: '#193a5f', 950: '#11253d',
                },
                blue: {
                    50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                    300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                    600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                    900: '#193a5f', 950: '#11253d',
                },
                slate: {
                    50:  '#f0f5ff',
                    100: '#e6edf8',
                    200: '#ccd8ee',
                    300: '#a8bcdb',
                    400: '#7a8faa',
                    500: '#4a5f80',
                    600: '#3a4f6e',
                    700: '#2a3b58',
                    800: '#1a2438',
                    900: '#0f1520',
                    950: '#080c12',
                }
            },
            borderRadius: { 'sm':'8px','md':'12px','lg':'16px','xl':'20px','2xl':'24px' }
        }
    }
}
