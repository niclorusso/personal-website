/**
 * MathJax Configuration
 * Enhanced configuration for better LaTeX rendering
 */

window.MathJax = {
    tex: {
        inlineMath: [['\\(', '\\)'], ['$', '$']],
        displayMath: [['\\[', '\\]'], ['$$', '$$']],
        processEscapes: true,
        processEnvironments: true,
        packages: {'[+]': ['ams', 'newcommand', 'configmacros']},
        tags: 'ams',
        tagSide: 'right',
        tagIndent: '0.8em'
    },
    options: {
        ignoreHtmlClass: 'tex2jax_ignore',
        processHtmlClass: 'tex2jax_process',
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    },
    loader: {
        load: ['[tex]/ams', '[tex]/newcommand', '[tex]/configmacros']
    },
    startup: {
        ready: () => {
            MathJax.startup.defaultReady();
            MathJax.startup.promise.then(() => {
                // Improve rendering quality
                MathJax.typesetPromise();
            });
        }
    },
    svg: {
        fontCache: 'global',
        displayAlign: 'center',
        displayIndent: '0'
    }
};
