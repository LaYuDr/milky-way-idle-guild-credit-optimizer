(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditStyles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PANEL_STYLES = `
        #mwi-credit-optimizer{--mwi-entry-min-width:300px;--mwi-entry-gap:10px;position:relative;z-index:0;box-sizing:border-box;flex:1;min-width:0;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:transparent;color:#f4f5ff;font:14px system-ui,sans-serif;container-type:inline-size}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 5px;font-size:17px}#mwi-credit-optimizer .mwi-plugin-version{margin:0 0 10px;padding:5px 7px;border:1px solid #474969;border-radius:4px;background:#292a46;color:#c9cbeb;font-size:11px;line-height:1.4}.mwi-plugin-version.mwi-update-available{border-color:#d8a33c;background:#463a21;color:#ffe09a;font-weight:700}
        #mwi-credit-optimizer .mwi-view-tabs-shell{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:stretch;margin:0 0 10px;border-bottom:1px solid #474969}#mwi-credit-optimizer .mwi-view-tabs{display:flex;min-width:0;overflow-x:auto;scrollbar-width:thin}#mwi-credit-optimizer .mwi-view-tab-item{position:relative;display:block;flex:0 0 auto;touch-action:pan-y;cursor:grab}#mwi-credit-optimizer .mwi-view-tab-item[hidden]{display:none!important}#mwi-credit-optimizer .mwi-view-tab-item:active{cursor:grabbing}#mwi-credit-optimizer .mwi-view-tab{min-height:40px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:6px 10px!important;touch-action:pan-y}#mwi-credit-optimizer .mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;background:#2a3a45!important;color:#fff!important}#mwi-credit-optimizer .mwi-view-order-actions{display:flex;align-items:center;border-left:1px solid #474969;background:#202238}#mwi-credit-optimizer .mwi-icon-button{position:relative;width:32px;min-width:32px;min-height:32px;padding:0!important;border:1px solid #555875!important;background:#343650!important;color:#fff!important}#mwi-credit-optimizer .mwi-view-order-actions .mwi-icon-button{width:30px;min-width:30px;min-height:40px;border-width:0 0 0 1px!important;border-radius:0!important}#mwi-credit-optimizer .mwi-icon-button:before{position:absolute;top:50%;left:50%;width:7px;height:7px;border-top:2px solid currentColor;border-left:2px solid currentColor;content:""}#mwi-credit-optimizer .mwi-icon-left:before{transform:translate(-35%,-50%) rotate(-45deg)}#mwi-credit-optimizer .mwi-icon-right:before{transform:translate(-65%,-50%) rotate(135deg)}#mwi-credit-optimizer .mwi-icon-up:before{transform:translate(-50%,-35%) rotate(45deg)}#mwi-credit-optimizer .mwi-icon-down:before{transform:translate(-50%,-65%) rotate(225deg)}
        #mwi-credit-optimizer .mwi-settings-trigger{width:34px;min-width:34px;min-height:40px;border-width:0 0 0 1px!important;border-radius:0!important;font-size:16px;line-height:1}#mwi-credit-optimizer .mwi-settings-trigger:before{display:none}#mwi-credit-optimizer .mwi-settings-trigger[aria-expanded="true"]{border-color:#77f3d0!important;background:#2c665d!important;color:#effffb!important}#mwi-credit-optimizer .mwi-settings-trigger>span{display:grid;place-items:center}
        #mwi-credit-optimizer .mwi-settings-panel{min-width:0;margin:-2px 0 10px;border:1px solid #4b5777;border-radius:8px;background:linear-gradient(145deg,#232a43,#25263f);box-shadow:0 8px 20px #0c0d173d;color:#f4f5ff}#mwi-credit-optimizer .mwi-settings-panel[hidden]{display:none!important}#mwi-credit-optimizer .mwi-settings-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #3f4969;background:#212941}#mwi-credit-optimizer .mwi-settings-header>span{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-settings-header h3{margin:0;color:#f3fff9;font-size:14px}#mwi-credit-optimizer .mwi-settings-header p{margin:0;color:#aebbd4;font-size:10px;line-height:1.35;overflow-wrap:anywhere}#mwi-credit-optimizer .mwi-settings-close{flex:0 0 auto;width:28px;min-width:28px;min-height:28px!important;padding:0!important;border:1px solid #59607e!important;background:#343650!important;color:#e8e9f8!important;font-size:18px;line-height:1}#mwi-credit-optimizer .mwi-settings-content{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:9px 10px}#mwi-credit-optimizer .mwi-settings-block{min-width:0;padding:8px 0}#mwi-credit-optimizer .mwi-settings-block+.mwi-settings-block{border-top:1px solid #424866}#mwi-credit-optimizer .mwi-settings-block-heading{display:grid;gap:2px;margin:0 0 7px}#mwi-credit-optimizer .mwi-settings-block-heading h4{margin:0;color:#f2f4ff;font-size:12px}#mwi-credit-optimizer .mwi-settings-block-heading p{margin:0;color:#aeb1cf;font-size:10px;line-height:1.4;overflow-wrap:anywhere}#mwi-credit-optimizer .mwi-settings-domains{display:grid;grid-template-columns:minmax(0,1fr);gap:7px}#mwi-credit-optimizer .mwi-settings-domain{min-width:0;margin:0;padding:6px;border:1px solid #3f4665;border-radius:5px;background:#23253d}#mwi-credit-optimizer .mwi-settings-domain legend{padding:0 4px;color:#77f3d0;font-size:10px;font-weight:700}#mwi-credit-optimizer .mwi-settings-domain[data-domain="combat"] legend{color:#8cb9ff}#mwi-credit-optimizer .mwi-settings-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:4px}#mwi-credit-optimizer label.mwi-settings-option{display:flex;align-items:center;gap:6px;min-width:0;min-height:30px;padding:4px 6px;border:1px solid transparent;border-radius:4px;background:#2b2d49;color:#e8eafa;font-size:10px;line-height:1.25;cursor:pointer}#mwi-credit-optimizer label.mwi-settings-option:hover{border-color:#59607e;background:#313451}#mwi-credit-optimizer .mwi-settings-option span{min-width:0;overflow-wrap:anywhere}#mwi-credit-optimizer .mwi-settings-option input[type="checkbox"]{flex:0 0 15px;width:15px;min-width:15px;height:15px;min-height:15px;margin:0;padding:0;accent-color:#43c4ad}#mwi-credit-optimizer .mwi-settings-placeholder{margin:0;padding:7px;border:1px dashed #545a79;border-radius:4px;color:#c6c9df;font-size:10px;line-height:1.35}#mwi-credit-optimizer label.mwi-settings-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:6px;border-radius:5px;background:#23253d;cursor:pointer}#mwi-credit-optimizer .mwi-settings-switch-copy{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-settings-switch-copy strong{color:#f2f4ff;font-size:11px}#mwi-credit-optimizer .mwi-settings-switch-copy small{color:#aeb1cf;font-size:9px;line-height:1.35;overflow-wrap:anywhere}#mwi-credit-optimizer input.mwi-settings-switch-input{position:relative;flex:0 0 36px;width:36px;min-width:36px;height:20px;min-height:20px;margin:0;padding:2px;border:1px solid #626784;border-radius:999px;background:#383a54;appearance:none;cursor:pointer;transition:border-color .16s ease,background-color .16s ease}#mwi-credit-optimizer input.mwi-settings-switch-input:before{display:block;width:14px;height:14px;border-radius:50%;background:#c7cae0;box-shadow:0 1px 3px #090a12aa;content:"";transition:transform .16s ease,background-color .16s ease}#mwi-credit-optimizer input.mwi-settings-switch-input:checked{border-color:#77f3d0;background:#2c665d}#mwi-credit-optimizer input.mwi-settings-switch-input:checked:before{transform:translateX(16px);background:#edfffa}#mwi-credit-optimizer .mwi-settings-status{min-height:0;margin:0;padding:0 10px 8px;color:#a9e9dc;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-settings-status:empty{display:none}#mwi-credit-optimizer .mwi-settings-status[data-error="true"]{color:#ff9ca3}
        @container (min-width:600px){#mwi-credit-optimizer .mwi-settings-domains{grid-template-columns:repeat(2,minmax(0,1fr))}}@container (max-width:400px){#mwi-credit-optimizer .mwi-settings-content{padding:7px}#mwi-credit-optimizer .mwi-settings-header{padding:8px}#mwi-credit-optimizer label.mwi-settings-switch{align-items:flex-start}}
        @media (prefers-reduced-motion:reduce){#mwi-credit-optimizer input.mwi-settings-switch-input,#mwi-credit-optimizer input.mwi-settings-switch-input:before{transition:none}}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap}#mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}#mwi-credit-optimizer .mwi-number-field{display:grid;gap:4px;min-width:0}#mwi-credit-optimizer .mwi-number-field>label{display:block}#mwi-credit-optimizer .mwi-price-reference{display:flex;flex:0 0 auto;align-items:center;gap:0;height:40px;min-height:40px;border:1px solid #5b5d7b;border-radius:6px;overflow:hidden;background:#292a46}#mwi-credit-optimizer .mwi-price-reference-label{padding:0 7px;color:#c9cbeb;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button{height:38px;min-height:38px;border-radius:0;background:#353653;color:#c9cbeb;padding:0 9px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button+button{border-left:1px solid #5b5d7b}#mwi-credit-optimizer .mwi-price-reference button[data-active="true"]{background:#43c4ad;color:#10201f}#mwi-credit-optimizer .mwi-controls>[data-role="refresh"]{min-height:40px}
        #mwi-credit-optimizer .mwi-number-stepper{display:flex;align-items:stretch;height:40px;min-height:40px;overflow:hidden;border:1px solid #7778b4;border-radius:6px;background:#f4f5ff;box-shadow:inset 0 1px 2px #3e416433}#mwi-credit-optimizer .mwi-number-stepper:focus-within{border-color:#65e3ca;outline:2px solid #65e3ca;outline-offset:2px;box-shadow:0 0 0 4px #77f3d026,inset 0 1px 2px #3e416433}#mwi-credit-optimizer .mwi-number-stepper input{height:38px;min-height:38px;margin:0;border:0;border-radius:0;background:#f4f5ff;color:#1f2030;font-variant-numeric:tabular-nums}#mwi-credit-optimizer .mwi-number-stepper input:focus-visible{outline:0;box-shadow:none}#mwi-credit-optimizer .mwi-target-credit-stepper input{width:112px}#mwi-credit-optimizer .mwi-price-limit-stepper input{flex:0 0 68px;width:68px;min-width:68px;padding:4px 7px}#mwi-credit-optimizer .mwi-number-stepper input[type="number"]{-moz-appearance:textfield;appearance:textfield}#mwi-credit-optimizer .mwi-number-stepper input[type="number"]::-webkit-inner-spin-button,#mwi-credit-optimizer .mwi-number-stepper input[type="number"]::-webkit-outer-spin-button{margin:0;-webkit-appearance:none}#mwi-credit-optimizer .mwi-stepper-buttons{display:grid;flex:0 0 34px;width:34px;min-width:34px;grid-template-rows:repeat(2,minmax(0,1fr));border-left:1px solid #7778b4;background:#373a58}#mwi-credit-optimizer button.mwi-stepper-button{display:grid;place-items:center;width:100%;min-width:0;height:19px;min-height:19px!important;margin:0;padding:0!important;border:0!important;border-radius:0!important;background:#3b3e5e!important;color:#f4f5ff!important;line-height:1;touch-action:none;user-select:none}#mwi-credit-optimizer button.mwi-stepper-button+button{border-top:1px solid #62658a!important}#mwi-credit-optimizer button.mwi-stepper-button:hover{background:#4a4e71!important;color:#fff!important}#mwi-credit-optimizer button.mwi-stepper-button:active,#mwi-credit-optimizer button.mwi-stepper-button[data-pressed="true"]{background:#245149!important;color:#bff8eb!important}#mwi-credit-optimizer button.mwi-stepper-button:focus-visible{z-index:5;outline:2px solid #77f3d0!important;outline-offset:-2px;box-shadow:none!important}#mwi-credit-optimizer .mwi-stepper-button svg{display:block;width:16px;height:10px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
        #mwi-credit-optimizer .mwi-price-limit-control{align-self:end;min-width:0}#mwi-credit-optimizer .mwi-price-limit{display:flex;align-items:center;height:40px;min-height:40px;max-width:100%;border:1px solid #5b5d7b;border-radius:6px;background:#292a46;color:#d8d8e8;font-size:11px;line-height:1.2;white-space:nowrap}#mwi-credit-optimizer .mwi-price-limit>span:not(.mwi-number-stepper){padding-inline:7px}#mwi-credit-optimizer .mwi-price-limit>span:last-child{padding-inline-start:5px}#mwi-credit-optimizer .mwi-price-limit .mwi-number-stepper{height:38px;min-height:38px;border-width:0 1px;border-radius:0;box-shadow:none}#mwi-credit-optimizer .mwi-price-limit .mwi-number-stepper:focus-within{outline:0;box-shadow:none}#mwi-credit-optimizer .mwi-price-limit input{height:38px;min-height:38px;margin:0;border:0;border-radius:0;font-variant-numeric:tabular-nums}#mwi-credit-optimizer .mwi-price-limit input::placeholder{color:#686b83;opacity:1}#mwi-credit-optimizer .mwi-price-limit:focus-within{border-color:#65e3ca;outline:2px solid #65e3ca;outline-offset:2px;box-shadow:0 0 0 4px #77f3d026}#mwi-credit-optimizer .mwi-price-limit-error{display:block;width:100%;max-width:260px;margin-top:4px;padding:4px 6px;border:1px solid #8f4f5b;border-radius:4px;background:#3d2730;color:#ffbdc3;font-size:10px;line-height:1.35;white-space:normal}#mwi-credit-optimizer .mwi-price-limit-error[hidden]{display:none!important}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-price-reference-label{padding-inline:4px}#mwi-credit-optimizer .mwi-price-reference button{padding-inline:5px}}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid,#mwi-credit-optimizer .mwi-token-value-list,#mwi-credit-optimizer .mwi-upgrade-plan-list,#mwi-credit-optimizer .mwi-material-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--mwi-entry-min-width)),1fr))}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:var(--mwi-entry-gap)}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden;container-type:inline-size}#mwi-credit-optimizer .mwi-credit-body[hidden],#mwi-credit-optimizer .mwi-token-value-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-body{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;scrollbar-color:#5b5d7b #202238}#mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;min-width:360px;table-layout:fixed;border-collapse:collapse;font-size:11px}#mwi-credit-optimizer .mwi-credit-item-column{width:32%}#mwi-credit-optimizer .mwi-credit-exchange-column{width:27%}#mwi-credit-optimizer .mwi-credit-unit-cost-column{width:24%}#mwi-credit-optimizer .mwi-credit-target-cost-column{width:17%}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mwi-credit-optimizer .mwi-credit-section .mwi-item-name{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;line-height:1.2}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}#mwi-credit-optimizer .mwi-market-item-link{display:inline-grid;place-items:center;flex:0 0 24px;width:24px;min-width:24px;height:24px;min-height:24px!important;padding:0!important;border:1px solid transparent!important;border-radius:5px!important;background:transparent!important;color:inherit!important;line-height:1;cursor:pointer}#mwi-credit-optimizer .mwi-market-item-link:hover,#mwi-credit-optimizer .mwi-market-item-link:focus-visible{border-color:#77f3d0!important;background:#2d6159!important;outline:none;box-shadow:0 0 0 2px #77f3d033}#mwi-credit-optimizer .mwi-market-item-link .mwi-item-icon{display:block}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section{margin:10px 0;border:1px solid #3a7b70;border-top:3px solid #43c4ad;border-radius:6px;background:#203b3a;overflow:hidden}#mwi-credit-optimizer .mwi-token-value-heading{border-bottom:1px solid #3a7b70}#mwi-credit-optimizer .mwi-token-value-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}#mwi-credit-optimizer .mwi-token-value-list{display:grid;column-gap:var(--mwi-entry-gap);row-gap:0;margin-inline:-1px}#mwi-credit-optimizer .mwi-token-value-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;min-width:0;padding:8px;border-top:1px solid #315d58}#mwi-credit-optimizer .mwi-token-value-row .mwi-item-icon{width:21px;height:21px;flex:0 0 21px}#mwi-credit-optimizer .mwi-token-value-exchange{color:#d7f6ef;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-row .mwi-cost{font-size:12px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-unpriced{color:#ffd17c;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-upgrade-preset{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:10px 11px;border:1px solid #3b8478;border-radius:9px;background:linear-gradient(135deg,#1f403d,#202f48);box-shadow:0 4px 14px #101d1c55}#mwi-credit-optimizer .mwi-upgrade-preset-copy{display:grid;gap:3px;min-width:0}#mwi-credit-optimizer .mwi-upgrade-preset-copy strong{color:#dffaf4;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-preset-copy small{color:#abd5cd;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{min-height:29px!important;padding:5px 8px!important;font-size:11px;white-space:nowrap;background:#43c4ad!important;color:#10201f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button[data-domain="combat"]{background:#6ea9ff!important;color:#15233f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button:disabled{background:#4d5968!important;color:#bec4ce!important;cursor:not-allowed}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(0,1fr);align-items:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));justify-content:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{width:100%;min-width:0}}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;gap:var(--mwi-entry-gap)}#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px;gap:9px;align-items:end;padding:11px;border:1px solid #45486d;border-radius:8px;background:linear-gradient(135deg,#2c2e4d,#252640);box-shadow:0 4px 13px #13142555}#mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;text-align:left;justify-items:stretch;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-plan label:first-child{grid-column:1/-1;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(2){grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(3){grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;max-width:none;min-width:0}#mwi-credit-optimizer .mwi-remove-plan{grid-column:3;grid-row:2;width:36px;min-width:36px;padding:0!important;font-size:21px;line-height:1;background:#555773!important;color:#fff!important}#mwi-credit-optimizer .mwi-upgrade-actions{display:flex;justify-content:center;gap:9px;margin:12px 0 4px}#mwi-credit-optimizer .mwi-clear-upgrade-plans{background:#a04455!important;color:#fff!important}#mwi-credit-optimizer .mwi-clear-upgrade-plans:hover{background:#bd4d61!important}#mwi-credit-optimizer .mwi-token-budget{display:grid;gap:8px;margin:10px 0 4px;padding:10px 11px;border:1px solid #56597f;border-radius:8px;background:linear-gradient(135deg,#30314f,#292a46)}#mwi-credit-optimizer .mwi-token-budget-heading{display:flex;justify-content:space-between;align-items:start;gap:10px;color:#e8e9f6}#mwi-credit-optimizer .mwi-token-budget-heading>span:first-child{display:grid;gap:2px}#mwi-credit-optimizer .mwi-token-budget-heading strong{font-size:12px}#mwi-credit-optimizer .mwi-token-budget-heading small{color:#bfc2de;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-token-budget-heading>span:last-child{color:#77f3d0;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-budget-inputs{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}#mwi-credit-optimizer .mwi-token-budget-inputs input[type="range"]{width:100%;min-height:24px;padding:0;border:0;background:transparent;accent-color:#43c4ad}#mwi-credit-optimizer .mwi-token-budget-inputs label{display:flex;align-items:center;gap:5px;color:#c9cbeb;font-size:11px}#mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"]{width:100px;min-height:30px}#mwi-credit-optimizer .mwi-token-credit-plan-toggle{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;column-gap:9px;width:100%;margin:9px 0 4px;padding:9px 11px!important;border:1px solid #56597f!important;border-radius:8px!important;background:linear-gradient(135deg,#30314f,#292a46)!important;color:#e8e9f6!important;text-align:left}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"]{border-color:#43c4ad!important;background:linear-gradient(135deg,#20453f,#243e3c)!important;color:#e4fff8!important;box-shadow:0 0 0 1px #43c4ad33}#mwi-credit-optimizer .mwi-token-credit-plan-indicator{display:grid;place-items:center;width:24px;height:24px;border:2px solid #777aa4;border-radius:6px;background:#20213a;color:#10201f;font-size:16px;line-height:1}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"] .mwi-token-credit-plan-indicator{border-color:#77f3d0;background:#77f3d0}#mwi-credit-optimizer .mwi-token-credit-plan-copy{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-token-credit-plan-copy strong{font-size:12px}#mwi-credit-optimizer .mwi-token-credit-plan-copy small{color:#bfc2de;font-size:10px;font-weight:500;line-height:1.35}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"] small{color:#bce8de}
        #mwi-credit-optimizer .mwi-material-list{display:grid;gap:var(--mwi-entry-gap);margin-top:12px}.mwi-material-row{position:relative;align-self:start;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px;border:1px solid #45486d;border-left:3px solid var(--mwi-material-accent);border-radius:8px;background:linear-gradient(135deg,#292b48,#23243d);box-shadow:0 4px 13px #13142544}.mwi-material-row-token{min-height:0;padding:9px 11px;background:linear-gradient(135deg,#2b2c49,#24253f)}.mwi-material-credit{display:flex;align-items:center;gap:8px;min-width:0}.mwi-material-copy{min-width:0;display:grid;gap:2px}.mwi-material-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f5ff;font-weight:700}.mwi-material-copy small{color:#aeb1d3;font-size:11px}.mwi-material-required{display:grid;justify-items:end;align-content:center;gap:1px;text-align:right}.mwi-material-required small{color:#aeb1d3;font-size:10px}.mwi-material-required strong{color:#77f3d0;font-size:18px;line-height:1.1}.mwi-material-plan{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:10px;border:1px solid #356c63;border-radius:7px;background:linear-gradient(135deg,#1f3e3c,#1d3736);overflow:hidden}.mwi-material-plan-auto{border-color:#b17c32;background:linear-gradient(135deg,#493a22,#3d3325)}.mwi-material-plan-auto .mwi-material-plan-icon{border-color:#d7a64d;background:linear-gradient(135deg,#725425,#5c4525)}.mwi-material-plan-auto .mwi-material-plan-need strong{color:#ffd17c}.mwi-material-plan-item{grid-row:1/-1;display:flex;align-items:center;gap:10px;min-width:0;padding:8px 0 8px 8px}.mwi-material-plan-icon{display:grid!important;place-items:center;flex:0 0 52px!important;width:52px!important;height:52px!important;min-width:52px!important;padding:0!important;border:1px solid #4da496;border-radius:7px;background:linear-gradient(135deg,#306b62,#275a53);box-shadow:inset 0 1px #7bd8c822,0 2px 5px #10232166}.mwi-material-plan-icon .mwi-market-item-link{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;border:0!important;border-radius:7px!important}.mwi-material-plan-icon .mwi-item-icon{width:50px!important;height:50px!important;flex:0 0 50px!important;max-width:50px;max-height:50px;object-fit:contain}.mwi-material-plan-item>span:last-child{min-width:0;display:grid;gap:3px}.mwi-material-plan-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e3fbf5;font-size:14px;line-height:1.15}.mwi-material-plan-item small{color:#afd4cd;font-size:12px;line-height:1.15}.mwi-material-plan-need{display:grid;justify-items:end;gap:1px;padding:8px 9px 0 0}.mwi-material-plan-need small{color:#afd4cd;font-size:10px}.mwi-material-plan-need strong{color:#77f3d0;font-size:17px;line-height:1}.mwi-material-plan-rate{grid-column:2;align-self:end;padding:0 9px 9px 0;color:#c5e3dd;font-size:10px;text-align:right;white-space:nowrap}.mwi-material-plan-unavailable{padding:9px;color:#ffd17c;font-size:11px}.mwi-plan-summary{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin:12px 0 8px;color:#d7d9ed;font-size:12px}.mwi-plan-summary span:not(.mwi-plan-separator){padding:4px 7px;border:1px solid #45486d;border-radius:999px;background:#292a46}.mwi-plan-separator{display:none}.mwi-upgrade-cost-summary{display:grid;gap:7px;margin:8px 0 10px;padding:11px 12px;border:1px solid #3d8d80;border-radius:8px;background:linear-gradient(135deg,#1d3d3b,#203b3a);box-shadow:0 5px 14px #101d1c55}.mwi-upgrade-cost-title{color:#b7e6dc;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note):not(.mwi-upgrade-cost-title){display:flex;justify-content:space-between;gap:8px;align-items:baseline}.mwi-upgrade-cost-summary span{color:#d7f6ef}.mwi-upgrade-cost-summary strong{color:#77f3d0;font-size:15px;text-align:right}.mwi-upgrade-cost-note{color:#ffd17c;font-size:11px}.mwi-upgrade-auto-token-note{color:#9bead8}.mwi-upgrade-cost-unavailable{color:#ffd17c;border-color:#80663f;background:#3b3323}.mwi-plugin-version .mwi-update-link,#mwi-credit-optimizer .mwi-plugin-footer a{color:#fff;text-decoration:underline;text-underline-offset:2px}.mwi-plugin-version .mwi-update-link:hover,#mwi-credit-optimizer .mwi-plugin-footer a:hover{color:#77f3d0}.mwi-plugin-footer{margin-top:16px;padding:10px 4px 2px;border-top:1px solid #474969;color:#aeb1d3;font-size:12px;line-height:1.6;text-align:center}
        #mwi-credit-optimizer .mwi-construction-budget{display:grid;grid-template-columns:minmax(175px,.9fr) repeat(3,minmax(0,.55fr));gap:1px;overflow:hidden;margin-bottom:10px;border:1px solid #8a703d;border-radius:8px;background:#6c5a35;box-shadow:0 5px 14px #15120c55}#mwi-credit-optimizer .mwi-construction-budget>div:not(.mwi-construction-meter){min-width:0;padding:10px 11px;background:linear-gradient(135deg,#302d36,#292a40)}
        #mwi-credit-optimizer .mwi-construction-budget-input{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:4px 8px}#mwi-credit-optimizer .mwi-construction-budget-input label{grid-column:1/-1;color:#ffe1a3;font-weight:700}#mwi-credit-optimizer .mwi-construction-budget-input input{width:100%;border-color:#d2a34a;font-variant-numeric:tabular-nums}#mwi-credit-optimizer .mwi-construction-budget-input>small{align-self:center;color:#c8b78f;font-size:10px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-metric{display:grid;align-content:center;gap:3px}#mwi-credit-optimizer .mwi-construction-metric small{color:#bdb6a5;font-size:10px}#mwi-credit-optimizer .mwi-construction-metric strong{overflow:hidden;color:#ffe09a;font:700 15px ui-monospace,SFMono-Regular,Menlo,monospace;text-overflow:ellipsis;white-space:nowrap}#mwi-credit-optimizer .mwi-construction-metric[data-state="danger"] strong{color:#ff9ca3}
        #mwi-credit-optimizer .mwi-construction-meter{grid-column:1/-1;height:5px;overflow:hidden;background:#171827}#mwi-credit-optimizer .mwi-construction-meter span{display:block;height:100%;background:#43c4ad}#mwi-credit-optimizer .mwi-construction-budget[data-over-budget="true"] .mwi-construction-meter span{background:#e65d68}
        #mwi-credit-optimizer .mwi-construction-layout{display:grid;gap:12px}#mwi-credit-optimizer .mwi-building-pane{min-width:0;overflow:hidden;border:1px solid #474969;border-radius:8px;background:#24253c}#mwi-credit-optimizer .mwi-building-pane-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #3f4160;background:#2b2d48}#mwi-credit-optimizer .mwi-building-pane-heading>span{min-width:0;display:grid;gap:3px}#mwi-credit-optimizer .mwi-building-heading-line{display:flex;align-items:center;flex-wrap:wrap;gap:6px}#mwi-credit-optimizer .mwi-building-pane-heading h4{margin:0;color:#fff;font-size:14px}#mwi-credit-optimizer .mwi-building-pane-heading small{color:#aeb1d3;font-size:10px}#mwi-credit-optimizer .mwi-building-level-status{padding:2px 6px;border:1px solid #4d7d73;border-radius:999px;background:#203d3a;color:#bff6ea!important}#mwi-credit-optimizer .mwi-building-level-status[data-levels-read="false"]{border-color:#80663f;background:#3b3323;color:#ffd17c!important}#mwi-credit-optimizer .mwi-building-pane-heading input{width:170px;min-width:110px}
        #mwi-credit-optimizer .mwi-building-categories{display:flex;flex-wrap:wrap;gap:4px;padding:7px 9px;border-bottom:1px solid #3f4160}#mwi-credit-optimizer .mwi-building-categories button{min-height:28px;padding:3px 8px;border:1px solid #555875;background:#30314c;color:#c9cbeb;font-size:11px}#mwi-credit-optimizer .mwi-building-categories button[data-active="true"]{border-color:#43c4ad;background:#245149;color:#dffff7}
        #mwi-credit-optimizer .mwi-building-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px;padding:9px}#mwi-credit-optimizer .mwi-building-tile[hidden]{display:none!important}#mwi-credit-optimizer .mwi-building-tile{--mwi-building-accent:#9567da;position:relative;display:grid;place-items:center;aspect-ratio:1;min-width:0;min-height:56px;padding:6px!important;border:1px solid #4b4e6d!important;border-radius:7px!important;background:#292b45!important;color:#fff!important;box-shadow:none;overflow:hidden}#mwi-credit-optimizer .mwi-building-tile[data-category="core"]{--mwi-building-accent:#d8a33c}#mwi-credit-optimizer .mwi-building-tile[data-category="life"]{--mwi-building-accent:#43c4ad}#mwi-credit-optimizer .mwi-building-tile[data-category="combat"]{--mwi-building-accent:#e65d68}#mwi-credit-optimizer .mwi-building-tile:hover{border-color:#8589b5!important;background:#30334f!important}#mwi-credit-optimizer .mwi-building-tile[data-planned="true"]{border-color:#43c4ad!important;background:#23413f!important}#mwi-credit-optimizer .mwi-building-tile[data-selected="true"]{outline:2px solid #77f3d0;outline-offset:-3px;background:#2b4f4a!important}#mwi-credit-optimizer .mwi-building-icon{display:grid;place-items:center;width:min(72%,44px);height:min(72%,44px);padding:1px;border:1px solid var(--mwi-building-accent);border-radius:6px;background:#22233a}#mwi-credit-optimizer .mwi-building-icon svg{display:block;width:100%;height:100%}#mwi-credit-optimizer .mwi-building-icon-fallback svg{padding:6px;fill:none;stroke:var(--mwi-building-accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}#mwi-credit-optimizer .mwi-building-level-badge,#mwi-credit-optimizer .mwi-building-target-badge{position:absolute;top:4px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:999px;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-building-level-badge{left:4px;background:#161827;color:#fff}#mwi-credit-optimizer .mwi-building-level-badge[data-level-known="false"]{color:#ffd17c}#mwi-credit-optimizer .mwi-building-target-badge{right:4px;background:#43c4ad;color:#10201f}#mwi-credit-optimizer .mwi-building-tile-name{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-queue{padding:10px;border:1px solid #605338;border-radius:7px;background:#2c2a36}#mwi-credit-optimizer .mwi-construction-queue h4{margin:0;color:#ffe09a;font-size:14px}#mwi-credit-optimizer .mwi-construction-queue-heading{display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:8px}#mwi-credit-optimizer .mwi-construction-queue-heading>span{display:grid;gap:2px}#mwi-credit-optimizer .mwi-construction-queue-heading small{color:#bdb6a5;font-size:10px}
        #mwi-credit-optimizer .mwi-construction-rail{position:relative;display:grid;gap:6px}#mwi-credit-optimizer .mwi-construction-group{position:relative;border:1px solid #4b4d68;border-radius:6px;background:#292a43;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease}#mwi-credit-optimizer .mwi-construction-group>header{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:6px;padding:0 8px 0 0;border-bottom:1px solid #3f4160}#mwi-credit-optimizer .mwi-construction-drag-handle{display:grid;place-items:center;width:44px;min-width:44px;min-height:44px;padding:0!important;border-radius:5px 0 0 0!important;background:transparent!important;color:#aeb1d3!important;touch-action:none;cursor:grab}#mwi-credit-optimizer .mwi-construction-drag-handle:active{cursor:grabbing}#mwi-credit-optimizer .mwi-construction-drag-handle span,#mwi-credit-optimizer .mwi-construction-drag-handle span:before,#mwi-credit-optimizer .mwi-construction-drag-handle span:after{width:3px;height:3px;border-radius:50%;background:currentColor;box-shadow:7px 0 currentColor}#mwi-credit-optimizer .mwi-construction-drag-handle span{position:relative;transform:translateX(-3px)}#mwi-credit-optimizer .mwi-construction-drag-handle span:before,#mwi-credit-optimizer .mwi-construction-drag-handle span:after{position:absolute;left:0;content:""}#mwi-credit-optimizer .mwi-construction-drag-handle span:before{top:-7px}#mwi-credit-optimizer .mwi-construction-drag-handle span:after{top:7px}#mwi-credit-optimizer .mwi-construction-group-select{display:grid;justify-items:start;gap:1px;min-width:0;min-height:44px;padding:5px 0!important;background:transparent!important;color:#fff!important;text-align:left}#mwi-credit-optimizer .mwi-construction-group-select strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mwi-credit-optimizer .mwi-construction-group-select small{color:#aeb1d3;font-size:10px}#mwi-credit-optimizer .mwi-construction-group>header>strong{color:#ffe09a;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-construction-group-steps{display:grid;gap:1px;padding:4px}#mwi-credit-optimizer .mwi-construction-step{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:7px;min-height:30px;padding:3px 5px;background:#24253d}#mwi-credit-optimizer .mwi-construction-step[data-over-budget="true"]{background:#3b2932;opacity:.84}#mwi-credit-optimizer .mwi-construction-step-index{display:grid;place-items:center;width:22px;height:22px;border:1px solid #6b5d40;border-radius:50%;background:#d8a33c;color:#241c0d;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-construction-step[data-over-budget="true"] .mwi-construction-step-index{border-color:#8b4b56;background:#e65d68;color:#fff}#mwi-credit-optimizer .mwi-construction-step-copy{min-width:0}#mwi-credit-optimizer .mwi-construction-step-copy small{color:#aeb1d3;font-size:10px}#mwi-credit-optimizer .mwi-construction-step-cost{color:#ffe09a;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-sort-dragging{border-color:#77f3d0!important;box-shadow:0 10px 24px #090a12aa;opacity:.92}#mwi-credit-optimizer .mwi-sort-drop-before:before,#mwi-credit-optimizer .mwi-sort-drop-after:after{position:absolute;right:0;left:0;z-index:9;height:2px;background:#77f3d0;content:""}#mwi-credit-optimizer .mwi-sort-drop-before:before{top:-4px}#mwi-credit-optimizer .mwi-sort-drop-after:after{bottom:-4px}#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-before:before,#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-after:after{top:5px;bottom:5px;width:2px;height:auto}#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-before:before{right:auto;left:-1px}#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-after:after{right:-1px;left:auto}
        #mwi-credit-optimizer .mwi-budget-cutoff{position:relative;z-index:2;display:flex;align-items:center;gap:6px;margin:3px 0;color:#ff9ca3;font-size:10px;font-weight:700}#mwi-credit-optimizer .mwi-budget-cutoff:before,#mwi-credit-optimizer .mwi-budget-cutoff:after{content:"";height:1px;background:#e65d68}#mwi-credit-optimizer .mwi-budget-cutoff:before{width:12px}#mwi-credit-optimizer .mwi-budget-cutoff:after{flex:1}#mwi-credit-optimizer .mwi-construction-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}#mwi-credit-optimizer .mwi-construction-actions button{flex:1 1 auto}#mwi-credit-optimizer .mwi-construction-actions .mwi-clear-building-plans{background:#5a3340;color:#ffd5d9}
        @container (min-width:720px){#mwi-credit-optimizer .mwi-construction-layout{grid-template-columns:minmax(330px,1fr) minmax(290px,.82fr);align-items:start}#mwi-credit-optimizer .mwi-construction-queue-pane{position:sticky;top:0}}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-construction-budget{grid-template-columns:repeat(3,minmax(0,1fr))}#mwi-credit-optimizer .mwi-construction-budget-input{grid-column:1/-1}#mwi-credit-optimizer .mwi-construction-metric strong{font-size:13px}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-building-pane-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-building-pane-heading input{width:100%}#mwi-credit-optimizer .mwi-construction-queue-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-construction-budget-input>small{text-align:left}}
        @media (prefers-reduced-motion:reduce){#mwi-credit-optimizer .mwi-construction-meter span,#mwi-credit-optimizer .mwi-construction-group{transition:none}}
        /* Queue-first construction workbench. */
        #mwi-credit-optimizer .mwi-construction-status{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0;padding:7px 9px;border-left:3px solid #43c4ad;background:#242b40;color:#dfe9f4}
        #mwi-credit-optimizer .mwi-construction-status[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-construction-status>span{min-width:0}
        #mwi-credit-optimizer .mwi-construction-status button{flex:0 0 auto;min-height:28px;padding:3px 8px}
        #mwi-credit-optimizer .mwi-field-error{color:#ff9ca3!important}
        #mwi-credit-optimizer .mwi-construction-budget{grid-template-columns:minmax(175px,1.15fr) repeat(3,minmax(76px,.55fr));margin-bottom:9px}
        #mwi-credit-optimizer .mwi-construction-budget>div{min-width:0;padding:9px 10px;background:linear-gradient(135deg,#302d36,#292a40)}
        #mwi-credit-optimizer .mwi-construction-budget-input{align-content:start}
        #mwi-credit-optimizer .mwi-construction-budget-input>small{white-space:normal}
        #mwi-credit-optimizer .mwi-construction-budget-input .mwi-field-error{grid-column:1/-1}
        #mwi-credit-optimizer .mwi-construction-budget-summary{grid-column:1/-1;display:block;min-width:0;padding:7px 10px;background:#252433;color:#d9cda9;font-size:10px;line-height:1.35}
        #mwi-credit-optimizer .mwi-construction-budget[data-over-budget="true"] .mwi-construction-budget-summary{color:#ffb0b6}
        #mwi-credit-optimizer .mwi-construction-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
        #mwi-credit-optimizer .mwi-construction-queue-pane,#mwi-credit-optimizer .mwi-building-picker{min-width:0}
        #mwi-credit-optimizer .mwi-construction-queue{padding:0;border:0;border-radius:0;background:transparent}
        #mwi-credit-optimizer .mwi-construction-queue-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:0;padding:8px 0;border-bottom:1px solid #605338}
        #mwi-credit-optimizer .mwi-construction-queue-heading>span:first-child{display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-queue-heading h4{color:#ffe09a}
        #mwi-credit-optimizer .mwi-construction-queue-heading small{line-height:1.35}
        #mwi-credit-optimizer .mwi-construction-queue-meta{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:5px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-actions{display:flex;align-items:center;gap:4px;margin:0}
        #mwi-credit-optimizer .mwi-construction-actions>button{flex:0 0 auto;min-height:28px;padding:3px 8px;font-size:10px}
        #mwi-credit-optimizer .mwi-construction-more{position:relative}
        #mwi-credit-optimizer .mwi-construction-more[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-construction-more summary{display:grid;place-items:center;width:30px;height:28px;border:1px solid #555875;border-radius:4px;background:#343650;color:#fff;font-weight:700;cursor:pointer;list-style:none}
        #mwi-credit-optimizer .mwi-construction-more summary::-webkit-details-marker{display:none}
        #mwi-credit-optimizer .mwi-construction-more[open] summary{border-color:#8589b5;background:#41435f}
        #mwi-credit-optimizer .mwi-construction-more>div{position:absolute;top:32px;right:0;z-index:12;width:max-content;padding:4px;border:1px solid #5e4250;border-radius:5px;background:#25263d;box-shadow:0 8px 20px #10111ccc}
        #mwi-credit-optimizer .mwi-construction-more button{min-height:30px;padding:4px 9px;background:#5a3340;color:#ffd5d9;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-empty{display:grid;justify-items:start;gap:3px;padding:14px 10px;border-bottom:1px solid #3f4160;color:#d7d9ed}
        #mwi-credit-optimizer .mwi-construction-empty strong{font-size:12px}
        #mwi-credit-optimizer .mwi-construction-empty small{color:#aeb1d3;font-size:10px}
        #mwi-credit-optimizer .mwi-construction-rail{position:relative;display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
        #mwi-credit-optimizer .mwi-construction-group{overflow:visible;border:1px solid #4b4d68;border-left:3px solid #777aa4;border-radius:6px;background:#292a43}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="within"]{border-left-color:#43c4ad}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="partial"]{border-left-color:#d8a33c}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="outside"]{border-left-color:#e65d68}
        #mwi-credit-optimizer .mwi-construction-row{display:grid;grid-template-columns:32px 40px minmax(112px,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:5px 7px;padding:7px 8px 7px 0}
        #mwi-credit-optimizer .mwi-construction-drag-handle{grid-column:1;grid-row:1/3;align-self:stretch;width:32px;min-width:32px;min-height:58px;border-radius:4px 0 0 4px!important}
        #mwi-credit-optimizer .mwi-construction-building-icon{grid-column:2;grid-row:1;display:grid;place-items:center;width:40px;height:40px}
        #mwi-credit-optimizer .mwi-construction-building-icon .mwi-building-icon{width:38px;height:38px}
        #mwi-credit-optimizer .mwi-construction-identity{grid-column:3;grid-row:1;display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-identity strong{overflow:hidden;color:#fff;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-identity small{overflow:hidden;color:#aeb1d3;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-cost{grid-column:4;grid-row:1;display:grid;justify-items:end;gap:1px;min-width:68px;text-align:right}
        #mwi-credit-optimizer .mwi-construction-cost small{color:#aeb1d3;font-size:8px}
        #mwi-credit-optimizer .mwi-construction-cost strong{color:#ffe09a;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-cost em{color:#aeb1d3;font-size:8px;font-style:normal;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="within"] .mwi-construction-cost em{color:#77f3d0}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="partial"] .mwi-construction-cost em{color:#ffd17c}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="outside"] .mwi-construction-cost em{color:#ff9ca3}
        #mwi-credit-optimizer .mwi-construction-row-actions{grid-column:2/-1;grid-row:2;display:flex;align-items:end;flex-wrap:wrap;gap:4px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-target{display:flex;align-items:center;gap:5px;min-width:104px;color:#aeb1d3;font-size:9px}
        #mwi-credit-optimizer .mwi-construction-target select{width:82px;min-width:0;min-height:30px;padding:3px 6px}
        #mwi-credit-optimizer .mwi-construction-row-actions button{min-height:30px;padding:3px 7px}
        #mwi-credit-optimizer .mwi-construction-level-button{min-width:34px;background:#43c4ad;color:#10201f}
        #mwi-credit-optimizer .mwi-construction-order-actions{display:flex;gap:4px;margin-left:auto}
        #mwi-credit-optimizer .mwi-construction-order-actions .mwi-icon-button{min-height:30px}
        #mwi-credit-optimizer .mwi-construction-expand,#mwi-credit-optimizer .mwi-construction-remove{width:32px;min-width:32px;padding:0!important;background:#343650;color:#fff}
        #mwi-credit-optimizer .mwi-construction-remove{background:#5a3340;color:#ffd5d9;font-size:18px}
        #mwi-credit-optimizer .mwi-construction-group-steps[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-construction-group-steps{display:grid;gap:1px;padding:4px;border-top:1px solid #3f4160}
        #mwi-credit-optimizer .mwi-budget-cutoff{margin:0;padding:5px 8px;border-top:1px solid #6f4550;border-bottom:1px solid #6f4550;background:#382831}
        #mwi-credit-optimizer .mwi-budget-cutoff:before{width:8px}
        #mwi-credit-optimizer .mwi-sort-dragging.mwi-construction-group{border-color:#77f3d0!important;box-shadow:0 10px 24px #090a12aa;opacity:.92}
        #mwi-credit-optimizer .mwi-building-picker{overflow:visible;border:1px solid #474969;border-radius:7px;background:#24253c}
        #mwi-credit-optimizer .mwi-building-picker-toggle{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px;width:100%;min-height:42px;padding:6px 8px!important;border-radius:6px!important;background:#2b2d48!important;color:#fff!important;text-align:left}
        #mwi-credit-optimizer .mwi-building-picker[data-open="true"] .mwi-building-picker-toggle{border-radius:6px 6px 0 0!important;border-bottom:1px solid #3f4160;background:#30324f!important}
        #mwi-credit-optimizer .mwi-building-picker-plus{display:grid;place-items:center;width:26px;height:26px;border:1px solid #43c4ad;border-radius:5px;background:#245149;color:#dffff7;font-size:17px}
        #mwi-credit-optimizer .mwi-building-picker-toggle>span:nth-child(2){display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 7px;min-width:0}
        #mwi-credit-optimizer .mwi-building-picker-toggle strong{font-size:12px}
        #mwi-credit-optimizer .mwi-building-picker-chevron{color:#aeb1d3}
        #mwi-credit-optimizer .mwi-building-level-status{padding:2px 6px;border:1px solid #80663f;border-radius:999px;background:#3b3323;color:#ffd17c!important;font-size:9px!important}
        #mwi-credit-optimizer .mwi-building-level-status[data-complete="true"]{border-color:#4d7d73;background:#203d3a;color:#bff6ea!important}
        #mwi-credit-optimizer .mwi-building-picker-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-building-picker-body{min-width:0}
        #mwi-credit-optimizer .mwi-building-pane-heading{padding:8px 9px}
        #mwi-credit-optimizer .mwi-building-pane-heading>span>h4{margin:0;color:#fff;font-size:12px}
        #mwi-credit-optimizer .mwi-building-pane-heading input{min-height:30px}
        #mwi-credit-optimizer .mwi-building-categories{padding:6px 7px}
        #mwi-credit-optimizer .mwi-building-grid{grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:5px;padding:7px}
        #mwi-credit-optimizer .mwi-building-tile{min-height:48px;padding:5px!important}
        #mwi-credit-optimizer .mwi-building-tile[data-planned="true"]{outline:1px solid #77f3d0;outline-offset:-3px}
        #mwi-credit-optimizer .mwi-building-tile:focus-visible{outline:2px solid #fff;outline-offset:1px}
        #mwi-credit-optimizer .mwi-building-icon{width:min(70%,42px);height:min(70%,42px)}
        @container (min-width:720px){#mwi-credit-optimizer .mwi-construction-layout{grid-template-columns:minmax(0,1fr);align-items:start}#mwi-credit-optimizer .mwi-construction-layout[data-picker-open="true"]{grid-template-columns:minmax(360px,1.12fr) minmax(300px,.88fr)}#mwi-credit-optimizer .mwi-construction-queue-pane{position:static;top:auto}}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-construction-budget{grid-template-columns:repeat(3,minmax(0,1fr))}#mwi-credit-optimizer .mwi-construction-budget-input{grid-column:1/-1}#mwi-credit-optimizer .mwi-construction-budget-summary{grid-column:1/-1}#mwi-credit-optimizer .mwi-construction-queue-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-construction-queue-meta{justify-content:space-between}#mwi-credit-optimizer .mwi-construction-actions{margin-left:auto}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-construction-row{grid-template-columns:30px 36px minmax(0,1fr) auto;gap:5px;padding-right:6px}#mwi-credit-optimizer .mwi-construction-drag-handle{width:30px;min-width:30px}#mwi-credit-optimizer .mwi-construction-building-icon{width:36px;height:36px}#mwi-credit-optimizer .mwi-construction-building-icon .mwi-building-icon{width:34px;height:34px}#mwi-credit-optimizer .mwi-construction-cost{min-width:58px}#mwi-credit-optimizer .mwi-construction-target{min-width:96px}#mwi-credit-optimizer .mwi-construction-target select{width:70px}#mwi-credit-optimizer .mwi-building-pane-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-building-pane-heading input{width:100%}}
        @media (prefers-reduced-motion:reduce){#mwi-credit-optimizer .mwi-construction-group,#mwi-credit-optimizer .mwi-building-picker-toggle{transition:none}}
        #mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="mixed"]{border-color:#d8a33c!important;background:linear-gradient(135deg,#493f2a,#353147)!important;color:#fff4d4!important;box-shadow:0 0 0 1px #d8a33c33}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="mixed"] .mwi-token-credit-plan-indicator{border-color:#ffd17c;background:#ffd17c;color:#332814}#mwi-credit-optimizer .mwi-material-copy{flex:1 1 auto}#mwi-credit-optimizer .mwi-material-exchange-mode{flex:0 0 auto;min-height:26px!important;padding:4px 7px!important;border:1px solid #66698f!important;border-radius:999px!important;background:#353653!important;color:#dfe1f4!important;font-size:10px;line-height:1.1;white-space:nowrap}#mwi-credit-optimizer .mwi-material-exchange-mode:hover{border-color:#77f3d0!important}#mwi-credit-optimizer .mwi-material-exchange-mode[data-active="true"]{border-color:#43c4ad!important;background:#245149!important;color:#dffff7!important;box-shadow:0 0 0 1px #43c4ad22}
        /* Compact shrine planner and aligned result rows. */
        #mwi-credit-optimizer .mwi-upgrade-planner{margin:0 0 9px;border:1px solid #4b4f75;border-radius:9px;background:#242641;overflow:hidden}
        #mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(170px,1fr) auto;gap:7px;margin:0;padding:7px 8px;border:0;border-bottom:1px solid #3b8478;border-radius:0;background:linear-gradient(135deg,#1f403d,#202f48);box-shadow:none}
        #mwi-credit-optimizer .mwi-upgrade-preset-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 9px}
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons button{min-height:28px!important;padding:4px 8px!important}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;grid-template-columns:minmax(0,1fr);gap:0}
        #mwi-credit-optimizer .mwi-upgrade-plan-columns,#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(140px,1.5fr) minmax(70px,.65fr) 18px minmax(70px,.65fr) 32px;gap:6px}
        #mwi-credit-optimizer .mwi-upgrade-plan-columns{align-items:end;padding:4px 8px 2px;border-bottom:1px solid #3e4264;background:#252742;color:#aeb1d3;font-size:10px}
        #mwi-credit-optimizer .mwi-upgrade-plan{align-items:center;padding:6px 8px;border:0;border-bottom:1px solid #3e4264;border-radius:0;background:#282a46;box-shadow:none}
        #mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;font-size:11px}
        #mwi-credit-optimizer .mwi-upgrade-field-label{display:none}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:2;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-level-arrow{grid-column:3;grid-row:1;align-self:center;justify-self:center;color:#aeb2d0}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:4;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;min-height:31px;max-width:none;min-width:0}
        #mwi-credit-optimizer .mwi-remove-plan{grid-column:5;grid-row:1;width:32px;min-width:32px;min-height:31px;padding:0!important;border:1px solid #74414b!important;border-radius:6px!important;background:#56323b!important;color:#ffdce2!important;font-size:18px;line-height:1}
        #mwi-credit-optimizer .mwi-upgrade-actions{display:flex;justify-content:space-between;align-items:center;gap:9px;margin:0;padding:7px 9px;background:#292b48}
        #mwi-credit-optimizer .mwi-upgrade-actions small{color:#bfc2de;font-size:10px}
        #mwi-credit-optimizer .mwi-upgrade-actions>span{display:flex;gap:7px}
        #mwi-credit-optimizer .mwi-upgrade-actions button{min-height:29px!important;padding:4px 9px!important;font-size:11px}
        #mwi-credit-optimizer .mwi-token-budget{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(220px,1.5fr) auto;align-items:center;gap:8px;margin:0 0 7px;padding:7px 9px}
        #mwi-credit-optimizer .mwi-token-budget-heading{display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-token-budget-inputs{grid-template-columns:minmax(54px,1fr) auto auto;gap:8px}
        #mwi-credit-optimizer .mwi-token-budget-range-wrap{position:relative;display:grid;align-items:center;min-width:0}
        #mwi-credit-optimizer .mwi-token-budget-inputs input[type="range"]{position:relative;z-index:1}
        #mwi-credit-optimizer .mwi-token-budget-snap-points{position:absolute;z-index:2;left:8px;right:8px;top:50%;height:0;pointer-events:none}
        #mwi-credit-optimizer .mwi-token-budget-snap-points i{position:absolute;left:var(--mwi-snap-position);width:4px;height:4px;border:1px solid #d6d8eb;border-radius:50%;background:#555873;box-shadow:0 0 0 1px #20213a;transform:translate(-50%,-50%)}
        #mwi-credit-optimizer .mwi-token-budget-percent{display:inline-grid;place-items:center;min-width:38px;padding:3px 5px;border:1px solid #686b92;border-radius:999px;background:#252640;color:#dfe1f4;font-size:10px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
        #mwi-credit-optimizer .mwi-token-budget-percent[data-snapped="true"]{border-color:#d8a33c;background:#493f2a;color:#ffe09a}
        #mwi-credit-optimizer .mwi-token-budget-available{justify-self:end;color:#77f3d0;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-status[data-role="upgrade-status"]{margin:7px 0 3px;color:#c9cbeb;font-size:11px;text-align:center}
        #mwi-credit-optimizer .mwi-plan-summary{justify-content:flex-start;gap:5px;margin:6px 0}
        #mwi-credit-optimizer .mwi-upgrade-cost-summary{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin:7px 0;padding:8px 10px;box-shadow:none}
        #mwi-credit-optimizer .mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note):not(.mwi-upgrade-cost-title){display:flex;align-items:baseline;gap:6px}
        #mwi-credit-optimizer .mwi-upgrade-cost-summary strong{font-size:14px}
        #mwi-credit-optimizer .mwi-upgrade-cost-note{flex:0 1 auto}
        #mwi-credit-optimizer .mwi-material-list{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin-top:7px}
        #mwi-credit-optimizer .mwi-material-row{display:grid;grid-template-columns:minmax(125px,1.05fr) 62px 58px minmax(280px,1.8fr);align-items:center;gap:5px;padding:6px 7px;box-shadow:none}
        #mwi-credit-optimizer .mwi-material-row-token{min-height:0;padding:7px 8px}
        #mwi-credit-optimizer .mwi-material-credit{grid-column:1;min-width:0}
        #mwi-credit-optimizer .mwi-material-credit>.mwi-market-item-link{width:32px;min-width:32px;height:32px;min-height:32px!important}
        #mwi-credit-optimizer .mwi-material-credit>.mwi-market-item-link .mwi-item-icon{width:30px;height:30px;flex-basis:30px}
        #mwi-credit-optimizer .mwi-material-name{font-size:13px}
        #mwi-credit-optimizer .mwi-material-required{grid-column:2}
        #mwi-credit-optimizer .mwi-material-required strong{font-size:16px}
        #mwi-credit-optimizer .mwi-material-exchange-mode,#mwi-credit-optimizer .mwi-material-exchange-mode-spacer{grid-column:3;justify-self:start}
        #mwi-credit-optimizer .mwi-material-plans{grid-column:4;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:5px;min-width:0}
        #mwi-credit-optimizer .mwi-material-plan{grid-column:auto;min-width:0;column-gap:7px}
        #mwi-credit-optimizer .mwi-material-plan-item{gap:7px;padding:5px 0 5px 5px}
        #mwi-credit-optimizer .mwi-material-plan-icon{flex:0 0 40px!important;width:40px!important;height:40px!important;min-width:40px!important}
        #mwi-credit-optimizer .mwi-material-plan-icon .mwi-market-item-link{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important}
        #mwi-credit-optimizer .mwi-material-plan-icon .mwi-item-icon{width:38px!important;height:38px!important;flex:0 0 38px!important;max-width:38px;max-height:38px}
        #mwi-credit-optimizer .mwi-material-plan-item b{font-size:12px}
        #mwi-credit-optimizer .mwi-material-plan-item small{font-size:10px}
        #mwi-credit-optimizer .mwi-material-plan-need{padding:5px 6px 0 0}
        #mwi-credit-optimizer .mwi-material-plan-need strong{font-size:15px}
        #mwi-credit-optimizer .mwi-material-plan-rate{padding:0 6px 6px 0}
        #mwi-credit-optimizer .mwi-material-plan-covered{align-self:center;color:#9bdab8;font-size:11px}
        @container (max-width:650px){#mwi-credit-optimizer .mwi-plan-summary{display:none}}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-token-budget{grid-template-columns:minmax(0,1fr) minmax(220px,1.2fr)}#mwi-credit-optimizer .mwi-token-budget-available{grid-column:1/-1;justify-self:start}#mwi-credit-optimizer .mwi-plan-summary{display:none}#mwi-credit-optimizer .mwi-material-row{grid-template-columns:minmax(125px,1fr) 62px 58px}#mwi-credit-optimizer .mwi-material-plans{grid-column:1/-1}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(0,1fr);align-items:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-copy strong{display:none}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));justify-content:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{width:100%;min-width:0;padding-inline:4px!important}#mwi-credit-optimizer .mwi-upgrade-plan-columns{display:none}#mwi-credit-optimizer .mwi-upgrade-plan{grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr) 32px;align-items:end}#mwi-credit-optimizer .mwi-upgrade-field-label{display:block}#mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1/4;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-level-arrow{display:block;grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:3;grid-row:2}#mwi-credit-optimizer .mwi-remove-plan{grid-column:4;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-actions{align-items:center;flex-direction:row}#mwi-credit-optimizer .mwi-upgrade-actions>span{display:flex}#mwi-credit-optimizer .mwi-token-budget{grid-template-columns:minmax(0,1fr) auto}#mwi-credit-optimizer .mwi-token-budget-heading{grid-column:1;grid-row:1}#mwi-credit-optimizer .mwi-token-budget-inputs{grid-column:1/-1;grid-row:2}#mwi-credit-optimizer .mwi-token-budget-available{grid-column:2;grid-row:1;align-self:start}#mwi-credit-optimizer .mwi-upgrade-cost-summary{align-items:flex-start;flex-direction:column;gap:4px;padding:6px 7px}#mwi-credit-optimizer .mwi-material-row{grid-template-columns:minmax(0,1fr) auto}#mwi-credit-optimizer .mwi-material-required{grid-column:2;grid-row:1}#mwi-credit-optimizer .mwi-material-exchange-mode,#mwi-credit-optimizer .mwi-material-exchange-mode-spacer{grid-column:1/-1}#mwi-credit-optimizer .mwi-material-plans{grid-column:1/-1}#mwi-credit-optimizer .mwi-material-plan{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto}#mwi-credit-optimizer .mwi-material-plan-item{grid-row:1/-1}#mwi-credit-optimizer .mwi-material-plan-need{grid-column:2;justify-items:end;padding:5px 6px 0 0}#mwi-credit-optimizer .mwi-material-plan-rate{grid-column:2;padding:0 6px 6px 0;text-align:right}}
        @container (max-width:650px){#mwi-credit-optimizer .mwi-token-budget{grid-template-columns:minmax(0,1fr) auto}#mwi-credit-optimizer .mwi-token-budget-heading{grid-column:1;grid-row:1}#mwi-credit-optimizer .mwi-token-budget-inputs{grid-column:1/-1;grid-row:2}#mwi-credit-optimizer .mwi-token-budget-available{grid-column:2;grid-row:1;align-self:start;justify-self:end}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"]{width:76px}#mwi-credit-optimizer .mwi-token-budget-inputs label>span{display:none}#mwi-credit-optimizer .mwi-token-budget-percent{min-width:34px;padding-inline:4px}}
        /* Shrine route workspace: one visual signature, compact utility controls, and explicit overflow safety. */
        #mwi-credit-optimizer{
          --mwi-void:#171827;
          --mwi-orbit:#242640;
          --mwi-panel:#2a2c49;
          --mwi-mint:#43c4ad;
          --mwi-mint-data:#77f3d0;
          --mwi-amber:#e2b45e;
          --mwi-danger:#b64b63;
        }
        #mwi-credit-optimizer :is(button,input,select):focus-visible{
          position:relative;
          z-index:4;
          outline:2px solid var(--mwi-mint-data);
          outline-offset:2px;
          box-shadow:0 0 0 4px #77f3d026;
        }
        #mwi-credit-optimizer .mwi-upgrade-planner{
          border-color:#4a4e77;
          border-radius:10px;
          background:linear-gradient(180deg,#262842 0%,#22243b 100%);
          box-shadow:0 8px 22px #0d0e1840;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset{
          grid-template-columns:minmax(150px,1fr) auto;
          min-width:0;
          padding:7px 8px;
          border-bottom-color:#3d766e;
          background:linear-gradient(105deg,#203c3a 0%,#242944 58%,#242640 100%);
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-copy{
          min-width:0;
          gap:2px 9px;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-copy strong{
          color:#ebfff9;
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
          font-size:11px;
          letter-spacing:.02em;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-copy small{
          min-width:0;
          color:#a9d6cc;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons{
          min-width:0;
          gap:6px;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons button{
          min-width:0;
          min-height:28px!important;
          padding:4px 8px!important;
          border:1px solid #61d5c2!important;
          background:#2c665d!important;
          color:#eafff9!important;
          font-size:10px;
          line-height:1.2;
          white-space:normal;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons button[data-domain="combat"]{
          border-color:#6ea9ff!important;
          background:#344f7d!important;
          color:#eef5ff!important;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan-columns,
        #mwi-credit-optimizer .mwi-upgrade-plan{
          grid-template-columns:minmax(108px,1.6fr) minmax(54px,.7fr) 12px minmax(54px,.7fr) 30px;
          gap:5px;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan-columns{
          position:relative;
          z-index:1;
          min-width:0;
          padding:4px 7px 3px;
          border-bottom-color:#414568;
          background:#242641;
          font-size:9px;
          letter-spacing:.03em;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan{
          position:relative;
          z-index:1;
          min-width:0;
          padding:5px 7px;
          border-bottom-color:#3c405f;
          background:#292b47e8;
          transition:background-color .16s ease;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan:hover,
        #mwi-credit-optimizer .mwi-upgrade-plan:focus-within{
          background:#303250;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan label{
          min-width:0;
          gap:2px;
        }
        #mwi-credit-optimizer .mwi-upgrade-field-label{display:none}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:2;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-level-arrow{display:block;grid-column:3;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:4;grid-row:1}
        #mwi-credit-optimizer .mwi-remove-plan{grid-column:5;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan select{
          min-width:0;
          min-height:30px;
          padding:3px 5px;
          border-color:#7478ad;
          border-radius:5px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          font-size:11px;
          line-height:1.2;
        }
        #mwi-credit-optimizer .mwi-upgrade-level-arrow{
          color:#9fa5d4;
          font-size:13px;
        }
        #mwi-credit-optimizer .mwi-remove-plan{
          width:30px;
          min-width:30px;
          min-height:30px;
          border-color:#75404c!important;
          background:#56323c!important;
          color:#ffe4e8!important;
          font-size:16px;
          transition:background-color .16s ease,transform .16s ease;
        }
        #mwi-credit-optimizer .mwi-remove-plan:hover{
          background:#713c48!important;
          transform:translateY(-1px);
        }
        #mwi-credit-optimizer .mwi-upgrade-actions{
          min-width:0;
          padding:6px 8px;
          border-top:1px solid #353958;
          background:#252742;
        }
        #mwi-credit-optimizer .mwi-upgrade-actions small{
          min-width:0;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-upgrade-actions>span{min-width:0;flex:0 0 auto}
        #mwi-credit-optimizer .mwi-upgrade-actions button{
          min-width:0;
          min-height:28px!important;
          line-height:1.2;
          white-space:normal;
        }
        #mwi-credit-optimizer .mwi-token-budget{
          border-color:#4d5279;
          background:linear-gradient(105deg,#292b48,#242640);
          box-shadow:0 5px 16px #0d0e182b;
        }
        #mwi-credit-optimizer .mwi-token-budget-heading strong{
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
        }
        #mwi-credit-optimizer .mwi-token-budget-percent,
        #mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"],
        #mwi-credit-optimizer .mwi-upgrade-cost-summary strong,
        #mwi-credit-optimizer .mwi-material-required strong,
        #mwi-credit-optimizer .mwi-material-plan-need strong{
          font-family:inherit;
          font-style:normal;
          font-variant-numeric:tabular-nums;
          font-feature-settings:"tnum" 1;
        }
        #mwi-credit-optimizer .mwi-upgrade-cost-summary{
          border-color:#3c857a;
          background:linear-gradient(105deg,#1f3e3b,#203836);
        }
        #mwi-credit-optimizer .mwi-material-row{
          background:linear-gradient(105deg,#292b48,#242640);
        }
        #mwi-credit-optimizer .mwi-shrine-guide-route{
          display:grid;
          grid-template-columns:auto minmax(0,1fr);
          align-items:center;
          gap:9px;
          margin:0 0 7px;
          padding:7px 9px;
          border:1px solid #4b4f75;
          border-radius:8px;
          background:linear-gradient(105deg,#282a46,#22243b);
        }
        #mwi-credit-optimizer .mwi-shrine-guide-toggle{
          display:flex;
          align-items:center;
          gap:6px;
          min-height:29px!important;
          padding:4px 9px!important;
          border:1px solid #65698f!important;
          background:#353752!important;
          color:#e3e5f7!important;
          white-space:nowrap;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-active="true"] .mwi-shrine-guide-toggle{
          border-color:#63e6c8!important;
          background:#245149!important;
          color:#eafff9!important;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-beacon{
          width:8px;
          height:8px;
          border:1px solid #a9acc9;
          border-radius:50%;
          background:#5c5f7e;
          box-shadow:0 0 0 3px #5c5f7e24;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-active="true"] .mwi-shrine-guide-beacon{
          border-color:#c9fff2;
          background:#63e6c8;
          box-shadow:0 0 0 3px #63e6c82e,0 0 12px #63e6c866;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-copy{display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-shrine-guide-copy strong{overflow:hidden;color:#f2f4ff;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-shrine-guide-copy small{min-width:0;color:#b9bdd9;font-size:10px;line-height:1.35;overflow-wrap:anywhere}
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-status="set_quantity"]{border-color:#d7a64d;background:linear-gradient(105deg,#3d3425,#292a46)}
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-status="complete"]{border-color:#4da496;background:linear-gradient(105deg,#203e3a,#252742)}
        @container (max-width:400px){
          #mwi-credit-optimizer .mwi-upgrade-preset{
            grid-template-columns:minmax(0,1fr);
            gap:6px;
          }
          #mwi-credit-optimizer .mwi-upgrade-preset-copy strong{display:none}
          #mwi-credit-optimizer .mwi-upgrade-preset-buttons{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
          }
          #mwi-credit-optimizer .mwi-upgrade-plan-columns{display:none}
          #mwi-credit-optimizer .mwi-shrine-guide-route{grid-template-columns:minmax(0,1fr)}
          #mwi-credit-optimizer .mwi-shrine-guide-toggle{justify-content:center;width:100%}
        }
        @container (max-width:350px){
          #mwi-credit-optimizer .mwi-upgrade-plan{
            grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr) 30px;
            align-items:end;
            padding-block:6px;
          }
          #mwi-credit-optimizer .mwi-upgrade-field-label{
            display:block;
            min-width:0;
            overflow:hidden;
            color:#b7bad6;
            font-size:9px;
            line-height:1.1;
            text-overflow:ellipsis;
            white-space:nowrap;
          }
          #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1/4;grid-row:1}
          #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:1;grid-row:2}
          #mwi-credit-optimizer .mwi-upgrade-level-arrow{display:block;grid-column:2;grid-row:2}
          #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:3;grid-row:2}
          #mwi-credit-optimizer .mwi-remove-plan{grid-column:4;grid-row:1}
          #mwi-credit-optimizer .mwi-upgrade-actions{
            align-items:flex-start;
            flex-direction:column;
            gap:6px;
          }
          #mwi-credit-optimizer .mwi-upgrade-actions>span{width:100%;display:grid;grid-template-columns:1fr auto}
          #mwi-credit-optimizer .mwi-upgrade-actions button{width:100%}
        }
        @media (prefers-reduced-motion:reduce){
          #mwi-credit-optimizer .mwi-upgrade-plan,
          #mwi-credit-optimizer .mwi-remove-plan{transition:none}
        }
        @container (max-width:400px){
          #mwi-credit-optimizer .mwi-view-tabs{overflow-x:hidden}
          #mwi-credit-optimizer .mwi-view-tab-item:not([hidden]){
            display:flex;
            flex:1 1 0;
            min-width:0;
          }
          #mwi-credit-optimizer .mwi-view-tab{
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            min-width:0;
            height:100%;
            min-height:40px!important;
            padding:5px 3px!important;
            font-size:11px;
            line-height:1.15;
            overflow-wrap:anywhere;
            hyphens:auto;
            text-align:center;
            white-space:normal;
            word-break:normal;
          }
          #mwi-credit-optimizer .mwi-view-order-actions .mwi-icon-button,
          #mwi-credit-optimizer .mwi-settings-trigger{height:100%}
        }
  `;

  function shrineGuideStyles(quantityHintId) {
    return `
      [data-mwi-shrine-guide]{--mwi-guide-color:#63e6c8;position:relative!important;z-index:5!important;outline:2px solid color-mix(in srgb,var(--mwi-guide-color) 78%,white 12%)!important;outline-offset:2px!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--mwi-guide-color) 20%,transparent),0 0 18px color-mix(in srgb,var(--mwi-guide-color) 25%,transparent)!important;scroll-margin:16px}
      [data-mwi-shrine-guide="goal"]{outline-style:dashed!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--mwi-guide-color) 13%,transparent)!important}
      [data-mwi-shrine-guide="pending"]{box-shadow:0 0 0 3px color-mix(in srgb,var(--mwi-guide-color) 16%,transparent)!important}
      [data-mwi-shrine-guide="active"]{animation:mwi-shrine-guide-pulse 1.45s ease-in-out infinite}
      input[data-mwi-shrine-guide="active"]{animation:none;filter:none!important;outline-width:1px!important;outline-offset:1px!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--mwi-guide-color) 22%,transparent)!important}
      #${quantityHintId}{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
      @keyframes mwi-shrine-guide-pulse{0%,100%{filter:brightness(1);box-shadow:0 0 0 3px color-mix(in srgb,var(--mwi-guide-color) 20%,transparent),0 0 12px color-mix(in srgb,var(--mwi-guide-color) 22%,transparent)}50%{filter:brightness(1.08);box-shadow:0 0 0 6px color-mix(in srgb,var(--mwi-guide-color) 13%,transparent),0 0 23px color-mix(in srgb,var(--mwi-guide-color) 38%,transparent)}}
      @media (prefers-reduced-motion:reduce){[data-mwi-shrine-guide="active"]{animation:none}}
    `;
  }

  const GUILD_EXCHANGE_ADVISOR_STYLES = `
    :host{all:initial;color-scheme:dark;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
    .advisor-stack{--credit:#4fcdb5;position:fixed;z-index:1065;display:grid;width:min(400px,calc(100vw - 24px));max-height:min(calc(100dvh - 24px),var(--advisor-available-height,100dvh));grid-template-rows:minmax(0,1fr) auto;gap:8px;pointer-events:none}
    .advisor{display:flex;min-height:0;flex-direction:column;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#626683 #171927;border:1px solid #414361;border-left:4px solid var(--credit);border-radius:7px;background:#171927;color:#f4f5ff;box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:13px;line-height:1.4;pointer-events:auto}
    .advisor[data-collapsed="true"]{overflow:hidden}.advisor[data-collapsed="true"] .head{border-bottom-color:transparent}.advisor[data-collapsed="true"] .advisor-toggle svg{transform:rotate(0deg)}
    .guide-quantity{display:grid;justify-items:center;gap:2px;padding:10px 12px;border:1px solid #414361;border-radius:7px;background:#171927;color:#f4f5ff;box-shadow:0 6px 18px rgba(0,0,0,.34);font-size:12px;line-height:1.5;text-align:center;pointer-events:auto;cursor:text;user-select:text;-webkit-user-select:text}
    .guide-quantity::selection,.guide-quantity *::selection{background:color-mix(in srgb,var(--credit) 52%,#171927);color:#fff}
    .guide-quantity-summary{max-width:100%;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .guide-quantity-detail{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:8px 8px 8px 12px;border-bottom:1px solid #414361;background:#24263e}.title{display:grid;min-width:0;gap:2px;font-size:17px;font-weight:700}.credit{display:flex;min-width:0;align-items:center;gap:5px;color:#c7cae4;font-size:11px;font-weight:500}.credit::before{width:9px;height:9px;flex:0 0 9px;border-radius:2px;background:var(--credit);content:""}.head-actions{display:flex;min-width:0;align-items:center;gap:4px}.reference{min-width:0;overflow:hidden;color:#bfc2de;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.advisor-toggle{display:grid;width:36px;height:36px;flex:0 0 36px;place-items:center;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:#dfe1f7;cursor:pointer}.advisor-toggle:hover{border-color:#555975;background:#30334f}.advisor-toggle:active{background:#1c1e31}.advisor-toggle:focus-visible{outline:2px solid color-mix(in srgb,var(--credit) 82%,white);outline-offset:1px}.advisor-toggle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(180deg);transition:transform .18s cubic-bezier(.16,1,.3,1)}.body{display:flex;flex:1;min-height:0;flex-direction:column;gap:9px;padding:11px 12px}.options{display:grid;flex:1;min-height:0;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);align-items:stretch;gap:8px}.options.single{grid-template-columns:minmax(0,1fr)}.option{min-width:0;padding:8px;border:1px solid #414361;border-radius:5px;background:#202139}.option.best{border-color:var(--credit);background:#193836}.label{display:block;margin-bottom:6px;color:#bfc2de;font-size:11px}.item{display:flex;align-items:center;gap:6px;min-width:0;color:#fff;font-size:14px;font-weight:700}.item .mwi-item-icon{width:32px;height:32px;flex:0 0 32px}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cost{margin:8px 0 5px;color:var(--credit);font-size:23px;font-weight:700;line-height:1}.cost small{margin-left:3px;color:#bfc2de;font-size:11px;font-weight:500}.detail{display:flex;justify-content:space-between;gap:5px;color:#bfc2de;font-size:11px;white-space:nowrap}.detail b{color:#e7e8f6;font-weight:600}.versus{display:grid;place-items:center;color:#aeb1d3;font-size:11px;font-weight:700}.versus span{display:grid;place-items:center;width:28px;height:28px;border:1px solid #58607a;border-radius:50%;background:#151722}.summary{padding:8px;border-top:1px solid #414361;color:#dfe1f7;text-align:center;font-size:12px;font-weight:600}.summary strong{color:var(--credit);font-size:16px}
    @media (pointer:coarse){.advisor-toggle{width:44px;height:44px;flex-basis:44px}}
    @media (prefers-reduced-motion:reduce){.advisor-toggle svg{transition:none}}
    @media (max-width:600px){.advisor-stack{max-height:min(300px,calc(100dvh - 24px),var(--advisor-available-height,100dvh))}.head{padding-block:6px}.options{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)}.body{padding:9px}.option{padding:7px}.cost{font-size:20px}}
  `;

  return { PANEL_STYLES, shrineGuideStyles, GUILD_EXCHANGE_ADVISOR_STYLES };
});
