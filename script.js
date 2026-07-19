const HOME_PREVIEW_LIMIT = 8;
let drawerPublications = [];
let drawerPublicationQuery = '';
let scrollLockDepth = 0;
let lockedScrollY = 0;
let overlayHistoryStack = [];

function normalizeSitePath(url) {
    if (!url) {
        return '';
    }

    try {
        const resolved = new URL(url, window.location.origin);
        return resolved.pathname.replace(/\/+$/, '') || '/';
    } catch (error) {
        return String(url).replace(/\/+$/, '') || '/';
    }
}

function isInternalBlogPath(url) {
    const path = normalizeSitePath(url);
    return path === '/blog' || path.startsWith('/blog/');
}

function pushOverlayHistoryEntry(entry) {
    const token = `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    overlayHistoryStack.push({ ...entry, token });
    const nextState = { ...(history.state || {}), __overlayToken: token };
    history.pushState(nextState, '');
    return token;
}

function removeOverlayHistoryEntries(predicate) {
    overlayHistoryStack = overlayHistoryStack.filter(entry => !predicate(entry));
}

window.addEventListener('popstate', () => {
    if (!overlayHistoryStack.length) {
        return;
    }

    const entry = overlayHistoryStack.pop();
    if (entry && typeof entry.onPop === 'function') {
        entry.onPop();
    }
});

function lockPageScroll() {
    if (scrollLockDepth === 0) {
        lockedScrollY = window.scrollY || window.pageYOffset || 0;
        document.body.style.top = `-${lockedScrollY}px`;
        document.body.classList.add('drawer-open');
        document.dispatchEvent(new CustomEvent('overlaylockchange', { detail: { locked: true } }));
    }

    scrollLockDepth += 1;
}

function unlockPageScroll() {
    if (scrollLockDepth === 0) {
        return;
    }

    scrollLockDepth -= 1;

    if (scrollLockDepth === 0) {
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        document.body.classList.remove('drawer-open');
        document.body.style.top = '';
        window.scrollTo(0, lockedScrollY);
        document.dispatchEvent(new CustomEvent('overlaylockchange', { detail: { locked: false } }));
        window.requestAnimationFrame(() => {
            root.style.scrollBehavior = previousScrollBehavior;
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const currentYear = document.getElementById('current-year');
    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    setupThemeToggle();
    setupMobileMenu();
    setupSmoothScroll();
    setupNavHighlight();
    makeAllLinksOpenInNewTab();
    setupLinkObserver();
    setupResearchTimeline();
    setupBlogReader();
    setupPublicationsDrawer();

    loadNews();
    loadHonors();
    loadPublications();
});

function setupThemeToggle() {
    const root = document.documentElement;
    const toggles = Array.from(document.querySelectorAll('[data-theme-toggle]'));
    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    if (!toggles.length) {
        return;
    }

    const clearStoredTheme = () => {
        try {
            localStorage.removeItem('site-theme-preference');
            localStorage.removeItem('site-theme');
        } catch (error) {}
    };

    const getTheme = () => root.getAttribute('data-theme') || 'light';
    const getPreferredTheme = () => (mediaQuery && mediaQuery.matches ? 'dark' : 'light');

    const applyTheme = theme => {
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme;

        toggles.forEach(toggle => {
            const icon = toggle.querySelector('i');
            const label = toggle.querySelector('.theme-toggle-text');
            const isDark = theme === 'dark';
            toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            toggle.setAttribute('title', isDark ? 'Light Mode' : 'Night Mode');
            if (icon) {
                icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
            }
            if (label) {
                label.textContent = isDark ? 'Light Mode' : 'Night Mode';
            }
        });
    };

    applyTheme(getPreferredTheme());

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
            clearStoredTheme();
            applyTheme(nextTheme);
        });
    });

    if (mediaQuery) {
        const handlePreferenceChange = event => {
            clearStoredTheme();
            applyTheme(event.matches ? 'dark' : 'light');
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handlePreferenceChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(handlePreferenceChange);
        }
    }
}

function setupResearchTimeline() {
    const nodes = Array.from(document.querySelectorAll('.research-timeline-node'));
    const timeline = document.querySelector('.research-timeline-interactive');
    const runner = timeline ? timeline.querySelector('.research-timeline-runner') : null;
    const detail = document.getElementById('research-timeline-detail');
    const typeEl = document.getElementById('research-timeline-detail-type');
    const titleEl = document.getElementById('research-timeline-detail-title');
    const metaEl = document.getElementById('research-timeline-detail-meta');
    const descriptionEl = document.getElementById('research-timeline-detail-description');
    const keywordsEl = document.getElementById('research-timeline-detail-keywords');

    if (!nodes.length || !timeline || !detail || !typeEl || !titleEl || !metaEl || !descriptionEl || !keywordsEl) {
        return;
    }

    let detailAnimationFrame = null;
    let detailHideTimeout = null;
    let autoplayTimer = null;
    let activeIndex = 0;
    let autoplayPaused = false;
    let overlayLocked = document.body.classList.contains('drawer-open');
    const mobileMediaQuery = window.matchMedia('(max-width: 767px)');
    const timelineSection = timeline.parentElement;
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let runnerAnimation = null;

    function clearDetailAnimation() {
        if (detailAnimationFrame !== null) {
            cancelAnimationFrame(detailAnimationFrame);
            detailAnimationFrame = null;
        }
        if (detailHideTimeout !== null) {
            clearTimeout(detailHideTimeout);
            detailHideTimeout = null;
        }
    }

    function hideDetailWithAnimation() {
        clearDetailAnimation();
        detail.classList.remove('is-entering', 'is-visible');
        detail.hidden = false;
        detail.classList.add('is-leaving');

        detailHideTimeout = window.setTimeout(() => {
            detail.hidden = true;
            detail.classList.remove('is-leaving');
            detailHideTimeout = null;
        }, 240);
    }

    function showDetailWithAnimation() {
        clearDetailAnimation();
        detail.hidden = false;
        detail.classList.remove('is-leaving', 'is-visible');
        detail.classList.add('is-entering');

        detailAnimationFrame = requestAnimationFrame(() => {
            detail.classList.add('is-visible');
            detail.classList.remove('is-entering');
            detailAnimationFrame = null;
        });
    }

    function placeDetail(node) {
        if (mobileMediaQuery.matches) {
            node.insertAdjacentElement('afterend', detail);
            detail.classList.add('research-timeline-detail-inline');
            return;
        }

        timelineSection.appendChild(detail);
        detail.classList.remove('research-timeline-detail-inline');
    }

    function getMarkerCenter(node) {
        const marker = node ? node.querySelector('.research-timeline-marker') : null;
        if (!marker) {
            return null;
        }

        const markerRect = marker.getBoundingClientRect();
        const timelineRect = timeline.getBoundingClientRect();

        return {
            x: markerRect.left - timelineRect.left + (markerRect.width / 2),
            y: markerRect.top - timelineRect.top + (markerRect.height / 2)
        };
    }

    function animateRunner(fromNode, toNode) {
        if (!runner || !fromNode || !toNode || fromNode === toNode || reduceMotionQuery.matches) {
            return;
        }

        const from = getMarkerCenter(fromNode);
        const to = getMarkerCenter(toNode);
        if (!from || !to) {
            return;
        }

        if (runnerAnimation) {
            runnerAnimation.cancel();
        }

        const isMobile = mobileMediaQuery.matches;
        const startTransform = isMobile
            ? `translate(-50%, -50%) translateY(${from.y}px)`
            : `translate(-50%, -50%) translateX(${from.x}px)`;
        const endTransform = isMobile
            ? `translate(-50%, -50%) translateY(${to.y}px)`
            : `translate(-50%, -50%) translateX(${to.x}px)`;

        if (isMobile) {
            runner.style.left = `${from.x}px`;
            runner.style.top = '0px';
        } else {
            runner.style.left = '0px';
            runner.style.top = `${from.y}px`;
        }

        runnerAnimation = runner.animate(
            [
                { transform: startTransform, opacity: 0 },
                { transform: startTransform, opacity: 1, offset: 0.16 },
                { transform: endTransform, opacity: 1, offset: 0.82 },
                { transform: endTransform, opacity: 0 }
            ],
            {
                duration: 620,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'forwards'
            }
        );

        runnerAnimation.onfinish = () => {
            runner.style.opacity = '0';
            runnerAnimation = null;
        };

        runnerAnimation.oncancel = () => {
            runner.style.opacity = '0';
            runnerAnimation = null;
        };
    }

    function setActiveNode(node) {
        const previousNode = nodes[activeIndex] || null;
        nodes.forEach(item => item.classList.remove('is-active'));

        node.classList.add('is-active');
        activeIndex = nodes.indexOf(node);
        typeEl.textContent = node.dataset.timelineType || '';
        titleEl.textContent = node.dataset.timelineTitle || '';
        metaEl.textContent = node.dataset.timelineMeta || '';
        metaEl.hidden = !metaEl.textContent;
        descriptionEl.textContent = node.dataset.timelineDescription || '';

        const keywords = node.dataset.timelineKeywords || '';
        if (keywords) {
            keywordsEl.hidden = false;
            keywordsEl.innerHTML = `<span>Keywords:</span> ${keywords}`;
        } else {
            keywordsEl.hidden = true;
            keywordsEl.textContent = '';
        }

        placeDetail(node);
        animateRunner(previousNode, node);
        showDetailWithAnimation();
    }

    function scheduleAutoplay() {
        if (autoplayTimer !== null) {
            clearTimeout(autoplayTimer);
        }

        if (autoplayPaused || overlayLocked || nodes.length <= 1) {
            autoplayTimer = null;
            return;
        }

        autoplayTimer = window.setTimeout(() => {
            activeIndex = (activeIndex + 1) % nodes.length;
            setActiveNode(nodes[activeIndex]);
            scheduleAutoplay();
        }, 3200);
    }

    nodes.forEach(node => {
        node.addEventListener('mouseenter', () => {
            autoplayPaused = true;
            scheduleAutoplay();
            setActiveNode(node);
        });

        node.addEventListener('click', () => {
            setActiveNode(node);
            autoplayPaused = true;
            scheduleAutoplay();
        });
    });

    setActiveNode(nodes[0]);
    scheduleAutoplay();

    timeline.addEventListener('mouseenter', () => {
        autoplayPaused = true;
        scheduleAutoplay();
    });

    timeline.addEventListener('mouseleave', () => {
        autoplayPaused = false;
        scheduleAutoplay();
    });

    document.addEventListener('overlaylockchange', event => {
        overlayLocked = Boolean(event.detail && event.detail.locked);
        scheduleAutoplay();
    });

    const handleViewportChange = () => {
        const activeNode = nodes[activeIndex] || nodes[0];
        if (!activeNode) {
            return;
        }
        placeDetail(activeNode);
    };

    if (typeof mobileMediaQuery.addEventListener === 'function') {
        mobileMediaQuery.addEventListener('change', handleViewportChange);
    } else if (typeof mobileMediaQuery.addListener === 'function') {
        mobileMediaQuery.addListener(handleViewportChange);
    }

}

function setupMobileMenu() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (!mobileMenuBtn || !mobileMenu) {
        return;
    }

    const openMenu = () => {
        mobileMenu.classList.add('is-visible');
        mobileMenu.setAttribute('aria-hidden', 'false');
        window.requestAnimationFrame(() => {
            mobileMenu.classList.add('is-open');
        });
    };

    const closeMenu = () => {
        if (!mobileMenu.classList.contains('is-open')) {
            return;
        }

        mobileMenu.classList.remove('is-open');
        mobileMenu.setAttribute('aria-hidden', 'true');
    };

    mobileMenuBtn.addEventListener('click', () => {
        if (mobileMenu.classList.contains('is-open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    document.addEventListener('click', event => {
        if (!mobileMenu.classList.contains('is-open')) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }

        if (mobileMenu.contains(target) || mobileMenuBtn.contains(target)) {
            return;
        }

        closeMenu();
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            closeMenu();
        });
    });

    mobileMenu.addEventListener('transitionend', event => {
        if (event.propertyName !== 'transform') {
            return;
        }

        if (!mobileMenu.classList.contains('is-open')) {
            mobileMenu.classList.remove('is-visible');
        }
    });
}

function setupSmoothScroll() {
    const navLinks = document.querySelectorAll('.nav-links a, .mobile-menu a');

    navLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            const href = this.getAttribute('href');
            if (!href || !href.startsWith('#')) {
                return;
            }

            const target = document.querySelector(href);
            if (!target) {
                return;
            }

            event.preventDefault();
            const nav = document.querySelector('.top-nav');
            const navHeight = nav ? nav.offsetHeight : 0;
            const top = target.offsetTop - navHeight - 20;

            window.scrollTo({
                top,
                behavior: 'smooth'
            });
        });
    });
}

function setupNavHighlight() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const sections = document.querySelectorAll('section[id]');
    const nav = document.querySelector('.top-nav');

    if (!navLinks.length || !sections.length || !nav) {
        return;
    }

    window.addEventListener('scroll', () => {
        let current = '';
        const navHeight = nav.offsetHeight;

        sections.forEach(section => {
            if (window.pageYOffset >= section.offsetTop - navHeight - 100) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            const target = (link.getAttribute('href') || '').replace('#', '');
            if (target === current || (current === 'homepage' && target === 'about')) {
                link.classList.add('active');
            }
        });
    });
}

function loadNews() {
    const homeContainer = document.getElementById('news-container');
    const expandedContainer = document.getElementById('news-expanded-container');
    const allContainer = document.getElementById('all-news-container');

    if (!homeContainer && !expandedContainer && !allContainer) {
        return;
    }

    fetch(getDataPath('news.json'))
        .then(handleJsonResponse)
        .then(items => {
            if (homeContainer) {
                renderNewsItems(items.slice(0, HOME_PREVIEW_LIMIT), homeContainer);
            }
            if (expandedContainer) {
                renderNewsItems(items.slice(HOME_PREVIEW_LIMIT), expandedContainer);
                setupExpandableSection({
                    buttonId: 'news-toggle-btn',
                    panelId: 'news-expanded-panel',
                    collapsedLabel: 'View All',
                    expandedLabel: 'Show Less',
                    hasExtraItems: items.length > HOME_PREVIEW_LIMIT
                });
            }
            if (allContainer) {
                renderNewsItems(items, allContainer);
            }
        })
        .catch(error => {
            console.error('Error loading news data:', error);
        });
}

function loadHonors() {
    const homeContainer = document.getElementById('honors-container');
    const expandedContainer = document.getElementById('honors-expanded-container');
    const allContainer = document.getElementById('all-honors-container');

    if (!homeContainer && !expandedContainer && !allContainer) {
        return;
    }

    fetch(getDataPath('honors.json'))
        .then(handleJsonResponse)
        .then(items => {
            if (homeContainer) {
                renderHonorsItems(items.slice(0, HOME_PREVIEW_LIMIT), homeContainer);
            }
            if (expandedContainer) {
                renderHonorsItems(items.slice(HOME_PREVIEW_LIMIT), expandedContainer);
                setupExpandableSection({
                    buttonId: 'honors-toggle-btn',
                    panelId: 'honors-expanded-panel',
                    collapsedLabel: 'View All',
                    expandedLabel: 'Show Less',
                    hasExtraItems: items.length > HOME_PREVIEW_LIMIT
                });
            }
            if (allContainer) {
                renderHonorsItems(items, allContainer);
            }
        })
        .catch(error => {
            console.error('Error loading honors data:', error);
        });
}

function loadPublications() {
    const featuredContainer = document.getElementById('featured-publications-container');
    const allContainer = document.getElementById('all-publications-container');
    const drawerContainer = document.getElementById('publications-drawer-container');

    if (!featuredContainer && !allContainer && !drawerContainer) {
        return;
    }

    fetch(getDataPath('publications.json'))
        .then(handleJsonResponse)
        .then(publications => {
            if (featuredContainer) {
                const featured = publications
                    .filter(pub => pub.showOnHomepage)
                    .sort(compareFeaturedPublications);
                renderFeaturedPublications(featuredContainer, featured);
            }

            if (allContainer) {
                renderAllPublicationsPage(allContainer, publications);
            }

            if (drawerContainer) {
                drawerPublications = publications.slice();
                renderPublicationsDrawer(drawerContainer, drawerPublications);
            }
        })
        .catch(error => {
            console.error('Error loading publications data:', error);
            const container = featuredContainer || allContainer || drawerContainer;
            if (container) {
                container.innerHTML = '<p>Failed to load publications.</p>';
            }
        });
}

function renderFeaturedPublications(container, publications) {
    container.innerHTML = '';

    if (!publications.length) {
        container.innerHTML = '<p>No featured publications available.</p>';
        return;
    }

    const list = document.createElement('ul');
    list.className = 'pub-list-ul';

    publications.forEach(pub => {
        list.appendChild(createPublicationItem(pub));
    });

    container.appendChild(list);
}

function renderAllPublicationsPage(container, publications) {
    const filter = getPublicationFilter();
    const filterIndicator = document.getElementById('filter-indicator');

    let filtered = publications.slice();

    if (filter === 'first-author') {
        filtered = filtered.filter(pub => pub.isFirstAuthor === true);
        if (filterIndicator) {
            filterIndicator.textContent = '(First Author)';
        }
    } else if (filter === 'accepted') {
        filtered = filtered.filter(pub => String(pub.type || '').toLowerCase() === 'accepted');
        if (filterIndicator) {
            filterIndicator.textContent = '(Accepted)';
        }
    } else if (filterIndicator) {
        filterIndicator.textContent = '';
    }

    updateFilterButtons(filter);
    renderAllPublications(container, filtered);
}

function renderPublicationsDrawer(container, publications) {
    container.innerHTML = '';

    const normalizedQuery = drawerPublicationQuery.trim().toLowerCase();
    let filtered = publications.slice();

    if (normalizedQuery) {
        filtered = filtered.filter(pub => matchesPublicationQuery(pub, normalizedQuery));
    }

    const accepted = filtered.filter(pub => String(pub.type || '').toLowerCase() === 'accepted');
    const preprints = filtered.filter(pub => String(pub.type || '').toLowerCase() !== 'accepted');

    if (!accepted.length && !preprints.length) {
        container.innerHTML = '<p class="empty-state">No publications found for this search.</p>';
        return;
    }

    if (accepted.length) {
        container.appendChild(createDrawerPublicationSection('Accepted Papers', accepted));
    }

    if (preprints.length) {
        container.appendChild(createDrawerPublicationSection('Preprints', preprints));
    }
}

function renderAllPublications(container, publications) {
    container.innerHTML = '';

    if (!publications.length) {
        container.innerHTML = '<p class="empty-state">No publications found for this filter.</p>';
        return;
    }

    const grouped = new Map();

    publications
        .slice()
        .sort(compareAllPublications)
        .forEach(pub => {
            const yearLabel = getYearLabel(pub);
            if (!grouped.has(yearLabel)) {
                grouped.set(yearLabel, []);
            }
            grouped.get(yearLabel).push(pub);
        });

    Array.from(grouped.entries()).forEach(([year, items]) => {
        const group = document.createElement('div');
        group.className = 'pub-year-group';

        const header = document.createElement('h3');
        header.className = 'pub-year-header';
        header.textContent = year;
        group.appendChild(header);

        const list = document.createElement('ul');
        list.className = 'pub-list-ul';
        items.forEach(pub => {
            list.appendChild(createPublicationItem(pub));
        });

        group.appendChild(list);
        container.appendChild(group);
    });
}

function createPublicationItem(pub) {
    const item = document.createElement('li');
    item.className = 'pub-list-item with-thumbnail-expanded';

    const content = document.createElement('div');
    content.className = 'pub-content-wrapper';

    const line1 = document.createElement('div');
    line1.className = 'pub-line-1';

    const title = document.createElement('span');
    title.className = 'pub-title-text';
    title.textContent = pub.displayTitle || pub.title || 'Untitled Publication';
    line1.appendChild(title);
    content.appendChild(line1);

    const line2 = document.createElement('div');
    line2.className = 'pub-line-2';
    line2.innerHTML = pub.authors || '';
    content.appendChild(line2);

    const line3 = document.createElement('div');
    line3.className = 'pub-line-3';

    const venueFullName = getVenueFullName(pub.venue, pub.year);
    const venueText = venueFullName || pub.venue || 'Preprint';

    const venueNameSpan = document.createElement('span');
    venueNameSpan.className = 'pub-venue-text';
    venueNameSpan.textContent = venueText;
    line3.appendChild(venueNameSpan);

    const badgeText = getHighlightBadge(pub.highlight);
    if (badgeText) {
        const badge = document.createElement('span');
        badge.className = 'pub-badge-highlight';
        badge.textContent = badgeText;
        line3.appendChild(badge);
    }

    content.appendChild(line3);

    const line4 = document.createElement('div');
    line4.className = 'pub-line-4';

    if (pub.tags && Array.isArray(pub.tags)) {
        pub.tags.forEach(tag => {
            const label = tag.text === 'Paper' ? 'PDF' : (tag.text || 'Link');
            const usableLink = hasUsableLink(tag.link);
            const isInternalBlog = usableLink && label === 'Blog' && isInternalBlogPath(tag.link);

            const button = document.createElement(isInternalBlog ? 'button' : (usableLink ? 'a' : 'span'));
            button.className = 'pub-link-btn';
            button.textContent = label;

            if (isInternalBlog) {
                button.type = 'button';
                button.dataset.blogUrl = normalizeSitePath(tag.link);
                button.classList.add('pub-blog-trigger');
            } else if (usableLink) {
                button.href = normalizeAssetPath(tag.link);
                button.target = '_blank';
                button.rel = 'noopener noreferrer';
            } else {
                button.classList.add('is-placeholder');
                button.title = 'Replace "#" with a real link in data/publications.json';
            }

            line4.appendChild(button);
        });
    }

    const citationText = getCitationText(pub);
    let citationPanel = null;
    if (citationText) {
        const citationToggle = document.createElement('button');
        citationToggle.type = 'button';
        citationToggle.className = 'pub-link-btn pub-citation-toggle';
        citationToggle.textContent = 'Cite';
        citationToggle.setAttribute('aria-expanded', 'false');

        citationPanel = document.createElement('div');
        citationPanel.className = 'pub-citation-panel';
        citationPanel.setAttribute('aria-hidden', 'true');

        const citationPanelInner = document.createElement('div');
        citationPanelInner.className = 'pub-citation-panel-inner';

        const citationHeader = document.createElement('div');
        citationHeader.className = 'pub-citation-header';

        const citationLabel = document.createElement('span');
        citationLabel.className = 'pub-citation-label';
        citationLabel.textContent = 'Citation';
        citationHeader.appendChild(citationLabel);

        const citationCode = document.createElement('pre');
        citationCode.className = 'pub-citation-text';
        citationCode.textContent = citationText;

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'pub-link-btn pub-citation-copy';
        copyButton.textContent = 'Copy';
        copyButton.addEventListener('click', async () => {
            const copied = await copyTextToClipboard(citationText);
            copyButton.textContent = copied ? 'Copied' : 'Copy failed';
            window.setTimeout(() => {
                copyButton.textContent = 'Copy';
            }, 1400);
        });
        citationHeader.appendChild(copyButton);

        citationPanelInner.appendChild(citationHeader);
        citationPanelInner.appendChild(citationCode);
        citationPanel.appendChild(citationPanelInner);

        citationToggle.addEventListener('click', () => {
            const isExpanded = citationToggle.getAttribute('aria-expanded') === 'true';
            const nextExpanded = !isExpanded;
            citationToggle.setAttribute('aria-expanded', String(nextExpanded));
            citationPanel.setAttribute('aria-hidden', String(!nextExpanded));

            if (nextExpanded) {
                citationPanel.classList.add('is-open');
                citationPanel.style.maxHeight = `${citationPanel.scrollHeight}px`;
            } else {
                citationPanel.style.maxHeight = `${citationPanel.scrollHeight}px`;
                window.requestAnimationFrame(() => {
                    citationPanel.classList.remove('is-open');
                    citationPanel.style.maxHeight = '0px';
                });
            }
        });

        line4.appendChild(citationToggle);
    }

    if (line4.children.length > 0) {
        content.appendChild(line4);
    }

    if (citationText) {
        content.appendChild(citationPanel);
    }

    item.appendChild(content);

    if (pub.thumbnail) {
        const thumbBox = document.createElement('div');
        thumbBox.className = 'pub-thumbnail-box';

        const thumbImg = document.createElement('img');
        const preferredThumbnail = getPreferredThumbnail(pub.thumbnail);
        thumbImg.src = preferredThumbnail.primary;
        thumbImg.alt = `${pub.title || 'Publication'} preview`;
        thumbImg.loading = 'lazy';
        thumbImg.onerror = function() {
            if (this.src !== preferredThumbnail.fallback) {
                this.onerror = null;
                this.src = preferredThumbnail.fallback;
            }
        };

        thumbBox.appendChild(thumbImg);
        item.appendChild(thumbBox);
    }

    return item;
}

function renderNewsItems(newsData, container) {
    container.innerHTML = '';

    newsData.forEach(newsItem => {
        const newsElement = document.createElement('div');
        newsElement.className = 'news-item';

        const dateElement = document.createElement('span');
        dateElement.className = 'news-date';
        dateElement.textContent = newsItem.date || '';

        const contentElement = document.createElement('div');
        contentElement.className = 'news-content';

        const textSpan = document.createElement('span');
        textSpan.innerHTML = newsItem.content || '';
        contentElement.appendChild(textSpan);

        if (Array.isArray(newsItem.links)) {
            newsItem.links.forEach(link => {
                const space = document.createTextNode(' ');
                contentElement.appendChild(space);

                const anchor = document.createElement('a');
                anchor.href = normalizeAssetPath(link.url || '#');
                anchor.textContent = link.text || 'Link';
                if (shouldOpenInNewTab(anchor.getAttribute('href'))) {
                    anchor.target = '_blank';
                    anchor.rel = 'noopener noreferrer';
                }
                contentElement.appendChild(anchor);
            });
        }

        newsElement.appendChild(dateElement);
        newsElement.appendChild(contentElement);
        container.appendChild(newsElement);
    });
}

function renderHonorsItems(honorsData, container) {
    container.innerHTML = '';

    honorsData.forEach(honorItem => {
        const honorElement = document.createElement('div');
        honorElement.className = 'honor-item';

        const yearElement = document.createElement('div');
        yearElement.className = 'honor-year';
        yearElement.textContent = honorItem.date || '';

        const contentElement = document.createElement('div');
        contentElement.className = 'honor-content';

        const titleElement = document.createElement('h3');
        titleElement.textContent = honorItem.title || '';
        contentElement.appendChild(titleElement);

        const descElement = document.createElement('p');
        if (honorItem.description) {
            descElement.innerHTML = honorItem.description;
        } else {
            descElement.textContent = honorItem.org || '';
        }
        contentElement.appendChild(descElement);

        honorElement.appendChild(yearElement);
        honorElement.appendChild(contentElement);
        container.appendChild(honorElement);
    });
}

function createDrawerPublicationSection(title, publications) {
    const group = document.createElement('section');
    group.className = 'drawer-publication-group';

    const header = document.createElement('h3');
    header.className = 'drawer-publication-heading';
    header.textContent = title;
    group.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'pub-list-ul';

    publications
        .slice()
        .sort(compareAllPublications)
        .forEach(pub => {
            list.appendChild(createPublicationItem(pub));
        });

    group.appendChild(list);
    return group;
}

function setupExpandableSection({ buttonId, panelId, collapsedLabel, expandedLabel, hasExtraItems }) {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);

    if (!button || !panel) {
        return;
    }

    if (!hasExtraItems) {
        button.hidden = true;
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        return;
    }

    const iconHtml = '<i class="fas fa-arrow-right ml-1"></i>';
    button.hidden = false;
    button.innerHTML = `${collapsedLabel} ${iconHtml}`;
    button.setAttribute('aria-expanded', 'false');
    panel.hidden = false;
    panel.classList.remove('is-open');
    panel.style.maxHeight = '0px';
    panel.setAttribute('aria-hidden', 'true');

    button.addEventListener('click', () => {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        const nextExpanded = !isExpanded;
        button.setAttribute('aria-expanded', String(nextExpanded));
        button.innerHTML = `${nextExpanded ? expandedLabel : collapsedLabel} ${iconHtml}`;
        panel.setAttribute('aria-hidden', String(!nextExpanded));

        if (nextExpanded) {
            panel.classList.add('is-open');
            panel.style.maxHeight = `${panel.scrollHeight}px`;
        } else {
            panel.style.maxHeight = `${panel.scrollHeight}px`;
            window.requestAnimationFrame(() => {
                panel.classList.remove('is-open');
                panel.style.maxHeight = '0px';
            });
        }
    });
}

function setupPublicationsDrawer() {
    const drawer = document.getElementById('publications-drawer');
    const drawerPanel = drawer ? drawer.querySelector('.drawer-panel') : null;
    const openButton = document.getElementById('open-publications-drawer');
    const closeButton = document.getElementById('close-publications-drawer');
    const searchInput = document.getElementById('publications-search-input');

    if (!drawer || !drawerPanel || !openButton || !closeButton) {
        return;
    }

    if (drawer.parentElement !== document.body) {
        document.body.appendChild(drawer);
    }

    let shouldForceCloseDrawerOnPop = false;

    const performCloseDrawer = () => {
        if (!drawer.classList.contains('is-open')) {
            return;
        }

        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        unlockPageScroll();
    };

    const closeDrawer = () => {
        if (!drawer.classList.contains('is-open')) {
            return;
        }

        const hasDrawerHistory = overlayHistoryStack.some(entry => entry.type === 'publications');
        if (hasDrawerHistory) {
            shouldForceCloseDrawerOnPop = true;
            history.back();
            return;
        }

        performCloseDrawer();
    };

    const openDrawer = () => {
        if (drawer.classList.contains('is-open')) {
            return;
        }

        drawer.classList.add('is-visible');
        drawer.setAttribute('aria-hidden', 'false');
        lockPageScroll();
        pushOverlayHistoryEntry({
            type: 'publications',
            onPop: () => {
                shouldForceCloseDrawerOnPop = false;
                performCloseDrawer();
            }
        });
        window.requestAnimationFrame(() => {
            drawer.classList.add('is-open');
        });
    };

    openButton.addEventListener('click', openDrawer);
    closeButton.addEventListener('click', closeDrawer);

    drawer.addEventListener('click', event => {
        if (event.target instanceof HTMLElement && event.target.dataset.closeDrawer === 'true') {
            closeDrawer();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && drawer.classList.contains('is-open')) {
            closeDrawer();
        }
    });

    drawerPanel.addEventListener('transitionend', event => {
        if (event.propertyName !== 'opacity') {
            return;
        }

        if (!drawer.classList.contains('is-open')) {
            drawer.classList.remove('is-visible');
            removeOverlayHistoryEntries(entry => entry.type === 'publications');
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', event => {
            drawerPublicationQuery = event.target.value || '';
            const drawerContainer = document.getElementById('publications-drawer-container');
            if (drawerContainer) {
                renderPublicationsDrawer(drawerContainer, drawerPublications);
            }
        });
    }
}

function setupBlogReader() {
    const overlay = document.getElementById('blog-reader');
    const panel = overlay ? overlay.querySelector('.blog-reader-panel') : null;
    const expandButton = document.getElementById('toggle-blog-reader-expand');
    const closeButton = document.getElementById('close-blog-reader');
    const title = document.getElementById('blog-reader-title');
    const date = document.getElementById('blog-reader-date');
    const tag = document.getElementById('blog-reader-tag');
    const content = document.getElementById('blog-reader-content');

    if (!overlay || !panel || !expandButton || !closeButton || !title || !date || !tag || !content) {
        return;
    }

    if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
    }

    let isFullscreen = false;
    let shouldForceCloseReaderOnPop = false;
    const postContentCache = new Map();
    const isMobileViewport = () => window.matchMedia('(max-width: 767px)').matches;
    const mobileViewportQuery = window.matchMedia('(max-width: 767px)');

    const populateReader = (targetTitle, targetDate, targetTag, targetContent, postElement) => {
        const source = postElement.querySelector('.blog-hidden-post');
        if (!source) {
            return null;
        }

        const sourceTitle = source.querySelector('.blog-hidden-title');
        const sourceDate = source.querySelector('.blog-hidden-date');
        const sourceTag = source.querySelector('.blog-hidden-tag');
        const postUrl = postElement.dataset.postUrl || '';

        targetTitle.textContent = sourceTitle ? sourceTitle.textContent : '';
        targetDate.textContent = sourceDate ? sourceDate.textContent : '';
        targetTag.textContent = sourceTag ? sourceTag.textContent : '';
        targetTag.hidden = !(sourceTag && sourceTag.textContent.trim());

        return postUrl;
    };

    const getPostElementByUrl = postUrl => {
        const normalizedPostUrl = normalizeSitePath(postUrl);
        return Array.from(document.querySelectorAll('.blog-item')).find(postElement => {
            return normalizeSitePath(postElement.dataset.postUrl || '') === normalizedPostUrl;
        }) || null;
    };

    const syncExpandButton = () => {
        expandButton.innerHTML = isFullscreen
            ? '<i class="fas fa-compress-alt"></i> Restore'
            : '<i class="fas fa-expand-alt"></i> Expand';
        expandButton.setAttribute('aria-label', isFullscreen ? 'Restore blog reader size' : 'Expand blog reader');
    };

    const syncResponsiveFullscreen = () => {
        if (!overlay.classList.contains('is-open')) {
            return;
        }

        isFullscreen = isMobileViewport();
        overlay.classList.toggle('is-fullscreen', isFullscreen);
        syncExpandButton();
    };

    const typesetBlogMath = target => {
        if (!target) {
            return;
        }

        let attempts = 0;
        const maxAttempts = 24;

        const runTypeset = () => {
            const mathJax = window.MathJax;

            if (!mathJax || typeof mathJax.typesetPromise !== 'function') {
                attempts += 1;
                if (attempts < maxAttempts) {
                    window.setTimeout(runTypeset, 150);
                }
                return;
            }

            const startTypeset = () => {
                mathJax.typesetClear?.([target]);
                mathJax.typesetPromise([target]).catch(error => {
                    console.error('Error typesetting blog math:', error);
                });
            };

            if (mathJax.startup?.promise && typeof mathJax.startup.promise.then === 'function') {
                mathJax.startup.promise.then(startTypeset).catch(error => {
                    console.error('Error waiting for MathJax startup:', error);
                });
                return;
            }

            startTypeset();
        };

        runTypeset();
    };

    const applyFullscreenState = nextFullscreen => {
        isFullscreen = nextFullscreen;
        overlay.classList.toggle('is-fullscreen', isFullscreen);
        syncExpandButton();
    };

    const loadRenderedPostContent = async postUrl => {
        if (!postUrl) {
            return '<p>Unable to load this post.</p>';
        }

        if (postContentCache.has(postUrl)) {
            return postContentCache.get(postUrl);
        }

        const response = await fetch(postUrl, { credentials: 'same-origin' });
        if (!response.ok) {
            throw new Error(`Failed to load post content from ${postUrl}`);
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const source = doc.getElementById('blog-post-source');
        const renderedContent = source ? source.innerHTML : '<p>Unable to load this post.</p>';
        postContentCache.set(postUrl, renderedContent);
        return renderedContent;
    };

    const openReader = async postElement => {
        if (!postElement) {
            return;
        }

        const postUrl = populateReader(title, date, tag, content, postElement);
        content.innerHTML = '<p>Loading post...</p>';
        applyFullscreenState(isMobileViewport());
        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');
        lockPageScroll();
        pushOverlayHistoryEntry({
            type: 'blog-reader',
            onPop: () => {
                if (shouldForceCloseReaderOnPop || !overlay.classList.contains('is-open') || isMobileViewport() || !isFullscreen) {
                    shouldForceCloseReaderOnPop = false;
                    performCloseReader();
                    return;
                }

                applyFullscreenState(false);
                pushOverlayHistoryEntry({
                    type: 'blog-reader',
                    onPop: () => {
                        shouldForceCloseReaderOnPop = false;
                        performCloseReader();
                    }
                });
            }
        });
        window.requestAnimationFrame(() => {
            overlay.classList.add('is-open');
        });

        try {
            content.innerHTML = await loadRenderedPostContent(postUrl);
            typesetBlogMath(content);
        } catch (error) {
            console.error('Error loading blog post content:', error);
            content.innerHTML = '<p>Failed to load this post.</p>';
        }
    };

    window.openBlogReaderByUrl = postUrl => {
        const postElement = getPostElementByUrl(postUrl);
        if (!postElement) {
            return false;
        }

        void openReader(postElement);
        return true;
    };

    const performCloseReader = () => {
        if (!overlay.classList.contains('is-open')) {
            return;
        }

        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        unlockPageScroll();
    };

    const closeReader = () => {
        if (!overlay.classList.contains('is-open')) {
            return;
        }

        const hasReaderHistory = overlayHistoryStack.some(entry => entry.type === 'blog-reader');
        if (hasReaderHistory) {
            shouldForceCloseReaderOnPop = true;
            history.back();
            return;
        }

        performCloseReader();
    };

    document.querySelectorAll('.blog-open-trigger').forEach(button => {
        button.addEventListener('click', async () => {
            const postElement = button.closest('.blog-item');
            if (postElement) {
                await openReader(postElement);
            }
        });
    });

    document.addEventListener('click', event => {
        const trigger = event.target instanceof Element ? event.target.closest('.pub-blog-trigger') : null;
        if (!trigger) {
            return;
        }

        const blogUrl = trigger.dataset.blogUrl || '';
        if (!blogUrl) {
            return;
        }

        event.preventDefault();
        if (!window.openBlogReaderByUrl(blogUrl)) {
            window.location.href = blogUrl;
        }
    });

    expandButton.addEventListener('click', () => {
        if (!overlay.classList.contains('is-open')) {
            return;
        }

        if (isMobileViewport()) {
            return;
        }

        applyFullscreenState(!isFullscreen);
    });

    closeButton.addEventListener('click', closeReader);

    overlay.addEventListener('click', event => {
        if (event.target instanceof HTMLElement && event.target.dataset.closeBlogReader === 'true') {
            closeReader();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
            closeReader();
        }
    });

    if (typeof mobileViewportQuery.addEventListener === 'function') {
        mobileViewportQuery.addEventListener('change', syncResponsiveFullscreen);
    } else if (typeof mobileViewportQuery.addListener === 'function') {
        mobileViewportQuery.addListener(syncResponsiveFullscreen);
    }

    window.addEventListener('resize', syncResponsiveFullscreen);

    panel.addEventListener('transitionend', event => {
        if (event.propertyName !== 'opacity') {
            return;
        }

        if (!overlay.classList.contains('is-open')) {
            applyFullscreenState(false);
            overlay.classList.remove('is-visible');
            title.textContent = '';
            date.textContent = '';
            tag.textContent = '';
            tag.hidden = true;
            content.innerHTML = '';
            removeOverlayHistoryEntries(entry => entry.type === 'blog-reader');
        }
    });
}

function compareFeaturedPublications(a, b) {
    const orderA = a.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
        return orderA - orderB;
    }
    return compareAllPublications(a, b);
}

function compareAllPublications(a, b) {
    const yearA = getComparableYear(a);
    const yearB = getComparableYear(b);
    if (yearA !== yearB) {
        return yearB - yearA;
    }

    const acceptedA = String(a.type || '').toLowerCase() === 'accepted' ? 1 : 0;
    const acceptedB = String(b.type || '').toLowerCase() === 'accepted' ? 1 : 0;
    if (acceptedA !== acceptedB) {
        return acceptedB - acceptedA;
    }

    const orderA = a.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
        return orderA - orderB;
    }

    return String(a.title || '').localeCompare(String(b.title || ''));
}

function getComparableYear(pub) {
    const parsedYear = parseInt(pub.year, 10);
    if (!Number.isNaN(parsedYear)) {
        return parsedYear;
    }
    return String(pub.type || '').toLowerCase() === 'accepted' ? 0 : 9999;
}

function getYearLabel(pub) {
    const parsedYear = parseInt(pub.year, 10);
    if (!Number.isNaN(parsedYear)) {
        return String(parsedYear);
    }
    return 'Preprints / Under Review';
}

function getPublicationFilter() {
    const params = new URLSearchParams(window.location.search);
    return params.get('filter') || 'all';
}

function updateFilterButtons(filter) {
    document.querySelectorAll('.filter-link').forEach(link => {
        link.classList.remove('active');
    });

    if (filter === 'first-author') {
        const element = document.getElementById('filter-first');
        if (element) {
            element.classList.add('active');
        }
    } else if (filter === 'accepted') {
        const element = document.getElementById('filter-accepted');
        if (element) {
            element.classList.add('active');
        }
    } else {
        const element = document.getElementById('filter-all');
        if (element) {
            element.classList.add('active');
        }
    }
}

function matchesPublicationQuery(pub, query) {
    const haystack = [
        pub.title,
        pub.displayTitle,
        stripHtml(pub.authors || ''),
        pub.venue,
        pub.year,
        pub.type
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(query);
}

function getHighlightBadge(highlightText) {
    const text = String(highlightText || '').toLowerCase();
    if (text.includes('oral')) {
        return 'Oral';
    }
    if (text.includes('spotlight')) {
        return 'Spotlight';
    }
    return '';
}

function getPreferredThumbnail(thumbnailPath) {
    const normalized = normalizeAssetPath(thumbnailPath);
    return { primary: normalized, fallback: normalized };
}

function getCitationText(pub) {
    if (pub.citation) {
        return String(pub.citation).trim();
    }

    const parts = [];
    const authors = stripHtml(pub.authors || '').trim();
    const title = String(pub.title || pub.displayTitle || '').trim();
    const venue = String(pub.venue || '').trim();

    if (authors) {
        parts.push(`${authors}.`);
    }
    if (title) {
        parts.push(`"${title}."`);
    }
    if (venue) {
        parts.push(venue);
    }

    return parts.join(' ').trim();
}

function stripHtml(value) {
    const temp = document.createElement('div');
    temp.innerHTML = value;
    return temp.textContent || temp.innerText || '';
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        return copied;
    } catch (error) {
        console.error('Failed to copy citation:', error);
        return false;
    }
}

function getVenueShortName(venueStr, year) {
    if (!venueStr) {
        return 'Preprint';
    }

    let revisionSuffix = '';
    if (venueStr.toLowerCase().includes('major revision')) {
        revisionSuffix = ', Major';
    } else if (venueStr.toLowerCase().includes('minor revision')) {
        revisionSuffix = ', Minor';
    }

    let s = venueStr.replace(/\d{4}/g, '').trim();
    let suffix = '';

    const conferences = ['NeurIPS', 'ICML', 'CVPR', 'ICCV', 'ECCV', 'ICRA', 'AAAI', 'GLOBECOM', 'INFOCOM', 'MOBICOM'];
    for (const conf of conferences) {
        if (s.includes(conf)) {
            if (year) {
                const yearStr = String(year);
                if (yearStr.length === 4) {
                    suffix = "'" + yearStr.substring(2);
                }
            }
            return conf + suffix + revisionSuffix;
        }
    }

    if (s.toLowerCase().includes('arxiv')) {
        return 'ArXiv' + revisionSuffix;
    }

    if (s.includes('TDSC')) return 'IEEE TDSC' + revisionSuffix;
    if (s.includes('TMC')) return 'IEEE TMC' + revisionSuffix;
    if (s.includes('JSAC')) return 'IEEE JSAC' + revisionSuffix;
    if (s.includes('TGCN')) return 'IEEE TGCN' + revisionSuffix;
    if (s.includes('LNET')) return 'IEEE LNET' + revisionSuffix;
    if (s.includes('TNSE')) return 'IEEE TNSE' + revisionSuffix;
    if (s.includes('IOTJ') || s.includes('IoTJ')) return 'IEEE IoTJ' + revisionSuffix;

    return s || 'Preprint';
}

function getVenueFullName(venueStr) {
    if (!venueStr) {
        return '';
    }

    const normalizedVenue = venueStr.trim();
    const s = normalizedVenue.replace(/\d{4}/g, '').trim();

    if (s.includes('TDSC')) return 'IEEE Transactions on Dependable and Secure Computing';
    if (s.includes('TMC')) return 'IEEE Transactions on Mobile Computing';
    if (s.includes('JSAC')) return 'IEEE Journal on Selected Areas in Communications';
    if (s.includes('TGCN')) return 'IEEE Transactions on Green Communications and Networking';
    if (s.includes('TNSE')) return 'IEEE Transactions on Network Science and Engineering';
    if (s.includes('IoTJ') || s.includes('IOTJ')) return 'IEEE Internet of Things Journal';
    if (s.includes('LNET') || s.includes('LNet')) return 'IEEE Networking Letters';

    if (s.includes('NeurIPS')) return 'Annual Conference on Neural Information Processing Systems';
    if (s.includes('ICML')) return 'International Conference on Machine Learning';
    if (s.includes('CVPR')) return 'IEEE/CVF Conference on Computer Vision and Pattern Recognition';
    if (s.includes('ICCV')) return 'IEEE/CVF International Conference on Computer Vision';
    if (s.includes('ECCV')) return 'European Conference on Computer Vision';
    if (s.includes('ICRA')) return 'IEEE International Conference on Robotics and Automation';
    if (s.includes('AAAI')) return 'AAAI Conference on Artificial Intelligence';
    if (s.includes('GLOBECOM')) return 'IEEE Global Communications Conference';
    if (s.includes('INFOCOM')) return 'IEEE International Conference on Computer Communications';
    if (s.includes('MOBICOM')) return 'Annual International Conference on Mobile Computing and Networking';

    if (s.toLowerCase().includes('arxiv')) return normalizedVenue;

    return normalizedVenue;
}

function getDataPath(fileName) {
    return window.location.pathname.includes('/pages/') ? `../data/${fileName}` : `data/${fileName}`;
}

function normalizeAssetPath(path) {
    if (!path) {
        return path;
    }

    if (/^(https?:|mailto:|tel:|#)/i.test(path)) {
        return path;
    }

    if (window.location.pathname.includes('/pages/') && !path.startsWith('../')) {
        return `../${path}`;
    }

    return path;
}

function hasUsableLink(path) {
    return Boolean(path) && path !== '#';
}

function handleJsonResponse(response) {
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

function makeAllLinksOpenInNewTab() {
    document.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (shouldOpenInNewTab(href)) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
}

function shouldOpenInNewTab(href) {
    if (!href) {
        return false;
    }
    if (href.startsWith('#')) {
        return false;
    }
    if (href.startsWith('../') || href.startsWith('./')) {
        return false;
    }
    if (/^[a-zA-Z]:\\/.test(href)) {
        return false;
    }
    if (href.endsWith('.html')) {
        return false;
    }
    return true;
}

function setupLinkObserver() {
    if (!document.body) {
        return;
    }

    const observer = new MutationObserver(mutations => {
        let shouldRefreshLinks = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldRefreshLinks = true;
                break;
            }
        }

        if (shouldRefreshLinks) {
            makeAllLinksOpenInNewTab();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
