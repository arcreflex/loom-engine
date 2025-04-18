import typography from '@tailwindcss/typography';
import lineClamp from '@tailwindcss/line-clamp';

/** @type {import('tailwindcss').Config} */

const TEXT_COLOR = '#E6EDF3';
const BORDER_COLOR = '#30363D';
const BACKGROUND_COLOR = '#0D1117';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'terminal-bg': BACKGROUND_COLOR,
        'terminal-text': TEXT_COLOR,
        'terminal-user': '#2F81F7',
        'terminal-assistant': '#A371F7',
        'terminal-border': BORDER_COLOR,
        'terminal-selection': '#264F78',
        'terminal-focus': '#58A6FF'
      },
      fontFamily: {
        mono: ['Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      typography: () => ({
        terminal: {
          css: {
            // Used for "prose" classes that go on the markdown-rendered stuff
            '--tw-prose-invert-body': TEXT_COLOR,
            '--tw-prose-invert-headings': TEXT_COLOR,
            '--tw-prose-invert-lead': TEXT_COLOR,
            '--tw-prose-invert-links': TEXT_COLOR,
            '--tw-prose-invert-bold': TEXT_COLOR,
            '--tw-prose-invert-counters': TEXT_COLOR,
            '--tw-prose-invert-bullets': TEXT_COLOR,
            '--tw-prose-invert-hr': BORDER_COLOR,
            '--tw-prose-invert-quotes': TEXT_COLOR,
            '--tw-prose-invert-quote-borders': BORDER_COLOR,
            '--tw-prose-invert-captions': TEXT_COLOR,
            '--tw-prose-invert-code': TEXT_COLOR,
            '--tw-prose-invert-pre-code': TEXT_COLOR,
            '--tw-prose-invert-pre-bg': BACKGROUND_COLOR,
            '--tw-prose-invert-th-borders': BORDER_COLOR,
            '--tw-prose-invert-td-borders': BORDER_COLOR
          }
        }
      })
    }
  },
  plugins: [typography, lineClamp]
};
