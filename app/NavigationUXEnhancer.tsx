"use client";

import { useEffect } from "react";

const SETTINGS_CLOSE_SELECTOR = ".settings-page .settings-close";

export default function NavigationUXEnhancer() {
  useEffect(() => {
    const getCloseButton = () => document.querySelector<HTMLButtonElement>(SETTINGS_CLOSE_SELECTOR);

    const decorateMobileMenu = () => {
      document.querySelectorAll<HTMLButtonElement>(".mobile-menu > button:not(.mobile-add)").forEach(button => {
        const label = button.textContent?.trim();
        if (label === "Βιβλιοθήκη") button.dataset.menuIcon = "library";
        if (label === "Ρυθμίσεις") button.dataset.menuIcon = "settings";
      });
    };

    decorateMobileMenu();
    const observer = new MutationObserver(decorateMobileMenu);
    observer.observe(document.body, { childList: true, subtree: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const closeButton = getCloseButton();
      if (!closeButton) return;
      event.preventDefault();
      closeButton.click();
    };

    const handleClick = (event: MouseEvent) => {
      const closeButton = getCloseButton();
      if (!closeButton) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button") as HTMLButtonElement | null;
      if (!button || button === closeButton || !button.closest(".app-header")) return;

      const label = button.textContent?.trim();
      const isSettingsButton = button.getAttribute("aria-label") === "Ρυθμίσεις" || label === "Ρυθμίσεις";
      if (!isSettingsButton) return;

      const cameFromMobileMenu = Boolean(button.closest(".mobile-menu"));
      event.preventDefault();
      event.stopPropagation();
      closeButton.click();

      if (cameFromMobileMenu) {
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(".mobile-menu-toggle.active")?.click();
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return (
    <style>{`
      .settings-page-header {
        position: relative;
        padding-right: 56px;
      }

      .settings-close {
        position: absolute;
        top: -2px;
        right: 0;
        z-index: 4;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: var(--raised);
        color: var(--text);
        font-size: 24px;
        font-weight: 400;
        line-height: 1;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        transition: transform .15s ease, background .15s ease, border-color .15s ease;
      }

      .settings-close:hover {
        transform: translateY(-1px);
        border-color: rgba(143,127,240,.48);
        background: rgba(143,127,240,.12);
      }

      .settings-close:focus-visible {
        outline: 2px solid var(--accent2);
        outline-offset: 3px;
      }

      @media (max-width: 700px) {
        .settings-page-header {
          padding-right: 62px;
        }

        .settings-close {
          top: -7px;
          width: 44px;
          height: 44px;
          border-radius: 13px;
          border-color: rgba(143,127,240,.34);
          background: rgba(255,255,255,.055);
          font-size: 28px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 10px 28px rgba(0,0,0,.24);
        }

        .mobile-menu-toggle {
          position: relative !important;
          display: block !important;
          padding: 0 !important;
          overflow: hidden;
          color: var(--text);
          transition: border-color .16s ease, background .16s ease, transform .16s ease !important;
        }

        .mobile-menu-toggle:active {
          transform: scale(.96);
        }

        .mobile-menu-toggle i {
          position: absolute !important;
          left: 50% !important;
          top: 50% !important;
          width: 17px !important;
          height: 1.5px !important;
          margin: 0 !important;
          border-radius: 999px !important;
          background: currentColor !important;
          transform-origin: center !important;
          transition: transform .2s cubic-bezier(.2,.8,.2,1), opacity .14s ease !important;
        }

        .mobile-menu-toggle i:nth-child(1) {
          transform: translate(-50%,-6px) !important;
        }

        .mobile-menu-toggle i:nth-child(2) {
          transform: translate(-50%,-50%) !important;
        }

        .mobile-menu-toggle i:nth-child(3) {
          transform: translate(-50%,5px) !important;
        }

        .mobile-menu-toggle.active {
          border-color: rgba(143,127,240,.42) !important;
          background: rgba(143,127,240,.11) !important;
        }

        .mobile-menu-toggle.active i:nth-child(1) {
          transform: translate(-50%,-50%) rotate(45deg) !important;
        }

        .mobile-menu-toggle.active i:nth-child(2) {
          opacity: 0 !important;
          transform: translate(-50%,-50%) scale(.5) !important;
        }

        .mobile-menu-toggle.active i:nth-child(3) {
          transform: translate(-50%,-50%) rotate(-45deg) !important;
        }

        .mobile-menu > button[data-menu-icon] {
          display: flex !important;
          align-items: center !important;
          gap: 11px !important;
          min-height: 42px !important;
          padding: 0 12px !important;
          border-radius: 10px !important;
          font-weight: 540 !important;
          letter-spacing: -.01em;
        }

        .mobile-menu > button[data-menu-icon]::before {
          content: "";
          width: 17px;
          height: 17px;
          flex: 0 0 17px;
          background: currentColor;
          opacity: .82;
          -webkit-mask-position: center;
          mask-position: center;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-size: contain;
          mask-size: contain;
        }

        .mobile-menu > button[data-menu-icon="library"]::before {
          -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='3' y='3' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3Crect x='14' y='14' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3C/svg%3E");
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='3' y='3' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3Crect x='14' y='14' width='7' height='7' rx='1.7' fill='none' stroke='black' stroke-width='1.8'/%3E%3C/svg%3E");
        }

        .mobile-menu > button[data-menu-icon="settings"]::before {
          -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 7h8M16 7h4M4 17h4M12 17h8M12 4v6M8 14v6' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E");
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 7h8M16 7h4M4 17h4M12 17h8M12 4v6M8 14v6' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E");
        }

        .mobile-menu > button[data-menu-icon].active::before {
          opacity: 1;
        }
      }
    `}</style>
  );
}
