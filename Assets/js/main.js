/**
 * RENDERER — Reads PROJECTS from projects.js and injects HTML
 * 
 * Featured: full article with media, description, features, tech tags, tool stack, buttons
 * Archive:  table row (desktop) + card (mobile), uses first 3 toolStack items as tags
 */

// ── Helper: build media HTML (gif or YouTube embed) ──
function buildMediaHTML(media) {
    if (media.type === 'youtube' && media.src) {
        return `
            <div class="project-visual">
                <iframe 
                    width="100%" height="315"
                    src="https://www.youtube.com/embed/${media.src}" 
                    title="${media.alt}"
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen
                    style="border-radius: 8px;"
                ></iframe>
            </div>`;
    }
    // Default: gif/image
    return `
        <div class="project-visual">
            <img src="${media.src}" alt="${media.alt}" class="project-img" loading="lazy">
        </div>`;
}

// ── Render a single Featured project ──
function renderFeaturedProject(project) {
    const layoutClass = project.layout === 'reverse' ? ' reverse' : '';

    const subtitleHTML = project.showSubtitle && project.subtitle
        ? ` <span style="font-size: 0.6em; font-weight: 400; color: var(--text-secondary);">${project.subtitle}</span>`
        : '';

    const featuresHTML = project.features
        .filter(f => f)
        .map(f => `<li>${f}</li>`)
        .join('\n                        ');

    const techTagsHTML = project.techTags
        .map(t => `<span>${t}</span>`)
        .join('\n                        ');

    const toolStackHTML = project.toolStack
        .map(t => `<span class="tool-item" title="${t.label}"><i class="${t.icon}"></i> ${t.label}</span>`)
        .join('\n                        ');

    const microcopyHTML = project.showMicrocopy && project.microcopy
        ? `\n                    <p class="micro-copy">${project.microcopy}</p>`
        : '';

    const mediaHTML = buildMediaHTML(project.media);

    return `
            <article class="project-item${layoutClass}">
                <div class="project-content">
                    <div class="project-meta">
                        <span class="role-badge">${project.badge}</span>
                        <h2 class="project-title">${project.title}${subtitleHTML}</h2>
                    </div>
                    <p class="project-description">${project.description}</p>
                    <ul class="project-features">
                        ${featuresHTML}
                    </ul>
                    <div class="tech-tags">
                        ${techTagsHTML}
                    </div>
                    <div class="tool-stack">
                        ${toolStackHTML}
                    </div>
                    <div class="project-actions">
                        <a href="${project.demoButton.url}" target="_blank" class="btn btn-primary">${project.demoButton.label}</a>
                        <a href="${project.codeButton.url}" target="_blank" class="btn btn-text">${project.codeButton.label}</a>
                    </div>${microcopyHTML}
                </div>
                ${mediaHTML}
            </article>`;
}

// ── Render a single Archive table row (desktop) ──
function renderArchiveRow(project) {
    const tags = project.toolStack.slice(0, 3)
        .map(t => `<span class="tag">${t.label}</span>`)
        .join('\n                                    ');

    return `
                        <tr>
                            <td class="project-name">${project.title}</td>
                            <td class="project-domain">
                                <strong>${project.domain}</strong><br>
                                ${project.descriptionShort}
                            </td>
                            <td>
                                <div class="tech-stack-mini">
                                    ${tags}
                                </div>
                            </td>
                            <td>
                                <div class="archive-actions">
                                    <a href="${project.demoButton.url}" title="${project.demoButton.label}"><i class="ph ph-play-circle"></i></a>
                                    <a href="${project.codeButton.url}" target="_blank" title="View Code"><i class="ph ph-github-logo"></i></a>
                                </div>
                            </td>
                        </tr>`;
}

// ── Render a single Archive mobile card ──
function renderArchiveCard(project) {
    const tags = project.toolStack.slice(0, 3)
        .map(t => `<span class="tag">${t.label}</span>`)
        .join('');

    return `
                <div class="archive-card">
                    <h4>${project.title}</h4>
                    <p class="role-highlight">${project.domain}</p>
                    <p>${project.descriptionShort}</p>
                    <div class="tech-stack-mini">
                        ${tags}
                    </div>
                    <div class="project-actions archive-card-actions">
                        <a href="${project.demoButton.url}" target="_blank" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">${project.demoButton.label}</a>
                        <a href="${project.codeButton.url}" target="_blank" class="btn btn-text" style="font-size: 0.85rem;">${project.codeButton.label}</a>
                    </div>
                </div>`;
}

// ── Main render logic ──
function renderProjects() {
    const featured = PROJECTS
        .filter(p => p.type === 'featured')
        .sort((a, b) => a.order - b.order);

    const archive = PROJECTS
        .filter(p => p.type === 'archive')
        .sort((a, b) => a.order - b.order);

    // Featured
    const featuredContainer = document.getElementById('featured-container');
    if (featuredContainer) {
        featuredContainer.innerHTML = featured.map(renderFeaturedProject).join('\n');
    }

    // Archive — Desktop table
    const archiveTbody = document.getElementById('archive-tbody');
    if (archiveTbody) {
        archiveTbody.innerHTML = archive.map(renderArchiveRow).join('\n');
    }

    // Archive — Mobile cards
    const mobileContainer = document.getElementById('mobile-archive-container');
    if (mobileContainer) {
        mobileContainer.innerHTML = archive.map(renderArchiveCard).join('\n');
    }
}

// ── DOMContentLoaded: render + existing UI logic ──
document.addEventListener('DOMContentLoaded', () => {
    // Render projects from data
    renderProjects();

    // Mobile Menu Toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            const icon = mobileBtn.querySelector('i');
            if (mobileMenu.classList.contains('active')) {
                icon.classList.remove('ph-list');
                icon.classList.add('ph-x');
            } else {
                icon.classList.remove('ph-x');
                icon.classList.add('ph-list');
            }
        });

        // Close menu when clicking a link
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                const icon = mobileBtn.querySelector('i');
                icon.classList.remove('ph-x');
                icon.classList.add('ph-list');
            });
        });
    }

    // Header Scroll Effect & Scroll Indicator Fade
    const navbar = document.querySelector('.navbar');
    const scrollIndicator = document.querySelector('.scroll-indicator');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 12, 0.95)';
            navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.5)';
            if (scrollIndicator) scrollIndicator.classList.add('hidden');
        } else {
            navbar.style.background = 'rgba(10, 10, 12, 0.85)';
            navbar.style.boxShadow = 'none';
            if (scrollIndicator) scrollIndicator.classList.remove('hidden');
        }
    });

    // Lazy Loading for Images (Intersection Observer)
    const images = document.querySelectorAll('img[loading="lazy"]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.src;
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    });

    images.forEach(img => imageObserver.observe(img));
});
