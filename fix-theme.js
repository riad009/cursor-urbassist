const fs = require('fs');
const path = require('path');

// All the files that still need fixing
const files = [
    'app/projects/[id]/description/page.tsx',
    'app/(auth)/login/page.tsx',
    'app/(auth)/register/page.tsx',
    'app/admin/page.tsx',
    'app/building-3d/page.tsx',
    'app/calculations/page.tsx',
    'app/developer/page.tsx',
    'app/editor/page.tsx',
    'app/export/page.tsx',
    'app/facades/page.tsx',
    'app/feasibility/page.tsx',
    'app/landscape/page.tsx',
    'app/location-plan/page.tsx',
    'app/plu-analysis/page.tsx',
    'app/regulations/page.tsx',
    'app/regulations/report/page.tsx',
    'app/site-plan/page.tsx',
    'app/site-plan-document/page.tsx',
    'app/statement/page.tsx',
    'app/terrain/page.tsx',
];

// Order matters - more specific patterns first
const replacements = [
    // Backgrounds - most specific first
    ['bg-slate-950/90', 'bg-white/95'],
    ['bg-slate-950', 'bg-white'],
    ['bg-slate-900/90', 'bg-white/95'],
    ['bg-slate-900/80', 'bg-slate-50'],
    ['bg-slate-900/60', 'bg-slate-50'],
    ['bg-slate-900/50', 'bg-slate-50'],
    ['bg-slate-900', 'bg-white'],
    ['bg-slate-800/80', 'bg-white'],
    ['bg-slate-800/60', 'bg-white'],
    ['bg-slate-800/50', 'bg-white'],
    ['bg-slate-800/40', 'bg-white'],
    ['bg-slate-800', 'bg-slate-100'],
    ['bg-slate-700/80', 'bg-slate-100'],
    ['bg-slate-700/60', 'bg-slate-50'],
    ['bg-slate-700/50', 'bg-slate-100'],
    ['bg-slate-700/40', 'bg-slate-50'],
    ['bg-slate-700/30', 'bg-slate-50'],
    ['bg-slate-700', 'bg-slate-100'],
    ['bg-slate-600/80', 'bg-slate-200'],
    ['bg-slate-600', 'bg-slate-200'],
    ['bg-slate-500/80', 'bg-slate-200'],

    // Hover backgrounds
    ['hover:bg-slate-800/80', 'hover:bg-slate-100'],
    ['hover:bg-slate-800', 'hover:bg-slate-100'],
    ['hover:bg-slate-700/80', 'hover:bg-slate-100'],
    ['hover:bg-slate-700/60', 'hover:bg-slate-100'],
    ['hover:bg-slate-700/40', 'hover:bg-slate-50'],
    ['hover:bg-slate-700/30', 'hover:bg-slate-50'],
    ['hover:bg-slate-700', 'hover:bg-slate-100'],
    ['hover:bg-slate-600', 'hover:bg-slate-200'],

    // Semi-transparent colored backgrounds
    ['bg-blue-500/20', 'bg-blue-100'],
    ['bg-blue-500/10', 'bg-blue-50'],
    ['bg-blue-500/5', 'bg-blue-50/80'],
    ['bg-emerald-500/20', 'bg-emerald-100'],
    ['bg-emerald-500/10', 'bg-emerald-50'],
    ['bg-purple-500/20', 'bg-purple-100'],
    ['bg-purple-500/10', 'bg-purple-50'],
    ['bg-amber-500/20', 'bg-amber-100'],
    ['bg-amber-500/10', 'bg-amber-50'],
    ['bg-red-500/20', 'bg-red-50'],
    ['bg-red-500/10', 'bg-red-50'],

    // Hover colored
    ['hover:bg-blue-500/30', 'hover:bg-blue-200'],
    ['hover:bg-blue-500/20', 'hover:bg-blue-100'],
    ['hover:bg-emerald-500/30', 'hover:bg-emerald-200'],
    ['hover:bg-purple-500/30', 'hover:bg-purple-200'],
    ['hover:bg-amber-500/30', 'hover:bg-amber-200'],

    // Borders
    ['border-white/10', 'border-slate-200'],
    ['border-white/5', 'border-slate-100'],
    ['border-white/20', 'border-slate-300'],
    ['border-blue-500/30', 'border-blue-200'],
    ['border-blue-500/20', 'border-blue-200'],
    ['border-blue-500/40', 'border-blue-300'],
    ['border-emerald-500/30', 'border-emerald-200'],
    ['border-emerald-500/20', 'border-emerald-200'],
    ['border-purple-500/30', 'border-purple-200'],
    ['border-purple-500/20', 'border-purple-200'],
    ['border-amber-500/30', 'border-amber-200'],
    ['border-amber-500/20', 'border-amber-200'],
    ['border-red-500/30', 'border-red-200'],
    ['hover:border-white/20', 'hover:border-slate-300'],

    // Ring
    ['ring-white/10', 'ring-slate-200'],
    ['ring-blue-500/30', 'ring-blue-200'],
    ['ring-blue-500/50', 'ring-blue-300'],
    ['ring-emerald-500/30', 'ring-emerald-200'],
    ['ring-amber-500/30', 'ring-amber-200'],

    // Text - from most specific / darkest first
    ['text-white', 'text-slate-900'],
    ['text-slate-200', 'text-slate-700'],
    ['text-slate-300', 'text-slate-600'],
    ['text-blue-400', 'text-blue-600'],
    ['text-blue-300', 'text-blue-700'],
    ['text-emerald-400', 'text-emerald-600'],
    ['text-emerald-300', 'text-emerald-700'],
    ['text-emerald-200', 'text-emerald-700'],
    ['text-purple-400', 'text-purple-600'],
    ['text-purple-300', 'text-purple-700'],
    ['text-amber-400', 'text-amber-600'],
    ['text-amber-300', 'text-amber-700'],
    ['text-amber-200', 'text-amber-700'],
    ['text-red-400', 'text-red-600'],
    ['text-red-300', 'text-red-600'],

    // Hover text
    ['hover:text-white', 'hover:text-slate-900'],
    ['hover:text-blue-300', 'hover:text-blue-700'],
    ['hover:text-blue-400', 'hover:text-blue-700'],

    // Gradients
    ['from-slate-900', 'from-white'],
    ['from-slate-800', 'from-slate-50'],
    ['to-slate-900', 'to-white'],
    ['to-slate-800', 'to-slate-50'],
    ['to-slate-700', 'to-white'],
    ['via-slate-800', 'via-slate-50'],
    ['from-blue-500/10', 'from-blue-50'],
    ['via-purple-500/5', 'via-purple-50/50'],
    ['to-purple-500/10', 'to-purple-50'],

    // Focus
    ['focus:border-blue-500/50', 'focus:border-blue-500'],

    // Placeholder
    ['placeholder-slate-500', 'placeholder-slate-400'],
    ['placeholder-slate-600', 'placeholder-slate-400'],

    // Divide
    ['divide-white/10', 'divide-slate-200'],
    ['divide-white/5', 'divide-slate-100'],
];

let updated = 0;
files.forEach(f => {
    const fp = path.join(__dirname, f);
    if (!fs.existsSync(fp)) {
        console.log('SKIP (not found):', f);
        return;
    }
    let content = fs.readFileSync(fp, 'utf8');
    const orig = content;
    replacements.forEach(([find, replace]) => {
        content = content.split(find).join(replace);
    });
    if (content !== orig) {
        fs.writeFileSync(fp, content);
        updated++;
        console.log('UPDATED:', f);
    } else {
        console.log('NO CHANGES:', f);
    }
});

console.log(`\nDone. Updated ${updated} files.`);
