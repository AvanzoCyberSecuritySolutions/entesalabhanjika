class CustomNavbar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <!-- Fixed navbar -->
      <nav class="fixed top-0 left-0 w-full flex justify-between items-center px-4 md:px-6 py-8 z-50">
        <div class="text-xl font-bold">
          <a href="index.html">
            <img src="images/entelogo-removebg-preview.png" alt="Logo" style="height: 100px; width: auto;">
          </a>
        </div>
        <ul class="hidden md:flex space-x-12 font-medium" style="color: #7B3D00;">
          <li><a href="index.html" class="relative">Home</a></li>
          <li><a href="#editor">Editor</a></li>
          <li><a href="#writer">Writer</a></li>
          <li><a href="in-house.html">In-house</a></li>
          <li><a href="#feedback">Feedback</a></li>
        </ul>
        <div id="mobile-menu-btn" class="md:hidden text-2xl text-[#7B3D00] cursor-pointer">☰</div>
      </nav>

      <!-- Mobile Drawer -->
      <dialog id="mobile-drawer" class="ml-auto mr-0 h-full max-h-none w-64 bg-[#FFF0D7] shadow-2xl p-8 m-0 border-none outline-none">
        <div class="flex justify-end mb-8">
          <button id="close-menu-btn" class="text-4xl text-[#7B3D00] cursor-pointer bg-transparent border-none outline-none">&times;</button>
        </div>
        <ul class="flex flex-col space-y-6 font-medium text-lg" style="color: #7B3D00;">
          <li><a href="index.html">Home</a></li>
          <li><a href="#editor">Editor</a></li>
          <li><a href="#writer">Writer</a></li>
          <li><a href="in-house.html">In-house</a></li>
          <li><a href="#feedback">Feedback</a></li>
        </ul>
      </dialog>
    `;

    // Highlight the active page link (Home, In-house, etc)
    const currentPath = window.location.pathname.split('/').pop();
    this.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      // Adding active styles if on that page, simplified for Home
      if (href === currentPath || (currentPath === '' && href === 'index.html')) {
         if (link.closest('ul.hidden')) {
             link.innerHTML += '<span class="absolute left-0 -bottom-1 w-full h-1 bg-[#EA9C1E] rounded-full"></span>';
             link.classList.add('relative');
         }
      }
    });

    const mobileMenuBtn = this.querySelector('#mobile-menu-btn');
    const mobileDrawer = this.querySelector('#mobile-drawer');
    const closeBtn = this.querySelector('#close-menu-btn');

    const openDrawer = () => {
      if (mobileDrawer) mobileDrawer.showModal();
    };

    const closeDrawer = () => {
      if (!mobileDrawer) return;
      mobileDrawer.classList.add('closing');
      setTimeout(() => {
        mobileDrawer.close();
        mobileDrawer.classList.remove('closing');
      }, 290);
    };

    if (mobileMenuBtn && mobileDrawer) {
      mobileMenuBtn.addEventListener('click', openDrawer);
      if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
      
      mobileDrawer.addEventListener('click', (e) => {
        if (e.target === mobileDrawer) {
          closeDrawer();
        }
      });

      mobileDrawer.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeDrawer);
      });
    }

    // Inject View Transitions CSS
    if (!document.getElementById('view-transitions-css')) {
      const style = document.createElement('style');
      style.id = 'view-transitions-css';
      style.textContent = `
        @media (prefers-reduced-motion: no-preference) {
          @view-transition {
            navigation: auto;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

customElements.define('custom-navbar', CustomNavbar);
