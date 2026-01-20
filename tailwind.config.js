module.exports = {
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Safelist dynamic classes referenced via variables like `${t.border}`
  safelist: [
    // Backgrounds (zinc scale)
    'bg-zinc-50','bg-zinc-100','bg-zinc-200','bg-zinc-800','bg-zinc-900','bg-zinc-950',
    // Surfaces/hover
    'bg-zinc-50','bg-zinc-100','bg-zinc-800','bg-white',
    // Borders
    'border-zinc-200','border-zinc-300','border-zinc-700','border-zinc-800',
    // Text
    'text-zinc-900','text-zinc-100','text-zinc-400','text-zinc-500','text-zinc-600','text-zinc-700',
    'text-blue-400','text-blue-600',
    // Gradients and emphasis
    'bg-gradient-to-r','from-purple-500','to-pink-500',
    // Status colors
    'bg-emerald-500','bg-amber-500','bg-red-500','bg-blue-500',
    // Utility variants used in code
    'shadow-xl','shadow-2xl','shadow-black/50','shadow-black/60',
    'focus:border-purple-500','focus:ring-2','focus:ring-purple-500/20',
    // Semantic utility colors used directly
    'bg-red-500/10','text-red-400','border-red-500/30','hover:bg-red-500/20','hover:border-red-500/50',
    'bg-zinc-800','text-zinc-200','border-zinc-700','hover:bg-zinc-700',
    'text-emerald-400','text-purple-400','text-purple-600',
    // Network connection tab colors
    'bg-cyan-500/20','text-cyan-300','border-cyan-500/50','text-cyan-400',
    'bg-amber-500/20','text-amber-300','border-amber-500/50',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px',  // iPhone SE and small phones
      },
    },
  },
  plugins: [],
}