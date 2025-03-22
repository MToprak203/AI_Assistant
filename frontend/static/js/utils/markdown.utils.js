// frontend/static/js/utils/markdown.utils.js

/**
 * Utility functions for Markdown and code formatting
 */
const MarkdownUtils = (function() {
    /**
     * Add copy buttons to code blocks
     * @param {HTMLElement} container - Container element with code blocks
     */
    const addCopyButtons = function(container) {
        const codeBlocks = container.querySelectorAll('pre code');

        codeBlocks.forEach(codeBlock => {
            // Apply syntax highlighting
            hljs.highlightElement(codeBlock);

            // Create copy button
            const pre = codeBlock.parentElement;
            const copyButton = DomUtils.createElement('button', {}, 'copy-btn');
            copyButton.textContent = 'Copy';

            // Add click handler
            DomUtils.addEvent(copyButton, 'click', () => {
                navigator.clipboard.writeText(codeBlock.textContent)
                    .then(() => {
                        copyButton.textContent = 'Copied!';
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                        }, 1500);
                    });
            });

            pre.appendChild(copyButton);
        });
    };

    return {
        /**
         * Parse and render markdown content
         * @param {string} content - Markdown content
         * @returns {string} HTML content
         */
        parseMarkdown: function(content) {
            return marked.parse(content);
        },

        /**
         * Parse markdown and add code syntax highlighting
         * @param {string} content - Markdown content
         * @param {HTMLElement} container - Target container for rendered content
         */
        renderMarkdown: function(content, container) {
            // Parse markdown
            const html = this.parseMarkdown(content);

            // Set HTML content
            DomUtils.setHtml(container, html);

            // Add copy buttons and syntax highlighting
            addCopyButtons(container);

            return container;
        }
    };
})();