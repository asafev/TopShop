# GLIC Page-Side Detection Limits

## Summary

Chrome GLIC rectangle selection runs outside the normal web page. The visible overlay is hosted by Chrome as a privileged WebUI document at:

```text
chrome-untrusted://glic/selection-overlay/
```

The normal page cannot query that document, read its shadow roots, inspect its `adoptedStyleSheets`, enumerate its CSS Houdini worklets, or observe its Mojo IPC. DevTools can inspect it because DevTools has browser-level privileges; page JavaScript does not.

Because of that boundary, a normal website cannot reliably say "GLIC is active" by checking selectors like `#selectionCorners`, `region-selection`, `post-selection-renderer`, or `#adopted-style-sheets`. Those nodes and styles are real, but they live in the GLIC WebUI realm, not in the page realm.

## How The Rectangle Selection Flow Works

The attached GLIC files show this flow:

```text
Chrome browser process
  -> opens chrome-untrusted://glic/selection-overlay/
  -> sends screenshot/selection data over Mojo
  -> receives selected rectangle updates over Mojo

chrome-untrusted://glic/selection-overlay/
  -> selection_overlay_app.js
  -> <selection-overlay-app>
  -> <glic-selection-overlay>
  -> internal canvas, shimmer, border glow, region-selection, post-selection-renderer
```

Important files:

- `browser_proxy.js`: creates a singleton bridge to Mojo remotes and callback routers.
- `selection_overlay.mojom-webui.js`: generated Mojo bindings for browser/WebUI communication.
- `selection_overlay_app.js`: top-level Lit element and screenshot callback listener.
- `glic_selection_overlay.js`: gesture controller for manual region drawing and post-selection dragging.
- `glic_selection_overlay.html.js`: internal overlay DOM template.
- `glic_selection_overlay.css.js`: internal overlay CSS and custom properties.
- `post_selection_paint_worklet.js`: registers CSS Houdini paint name `post-selection`.
- `selection_overlay_base_handler_impl.js`: maps overlay region changes back to browser-side Mojo calls.

The key rectangle drag path in `glic_selection_overlay.js` is:

```js
handleGestureDrag(event) {
  this.setPointerCapture(event.pointerId);

  if (this.draggingRespondent === DragFeature.NONE) {
    this.draggingRespondent = DragFeature.MANUAL_REGION;
    this.activeRegionId = "";
    this.baseHandler.activeRegionId = "";
    this.selectionElements.postSelectionRenderer.clearSelection();
    this.selectionElements.regionSelectionLayer.handleGestureStart();
  }

  if (this.draggingRespondent === DragFeature.MANUAL_REGION) {
    this.selectionElements.regionSelectionLayer.handleGestureDrag(this.currentGesture);
  }
}
```

Region changes are then sent through:

```js
BrowserProxyImpl.getInstance().handler.adjustRegion({ region: rect, id });
```

That is Mojo IPC to Chrome, not an event or DOM mutation in the normal page.

## Why Page Selectors Do Not Work

A normal page sees only its own DOM:

```js
document.querySelector('#selectionCorners')
```

This checks the page document, not `chrome-untrusted://glic/selection-overlay/`. It will return `null` even while DevTools shows `#selectionCorners` inside GLIC.

The same applies to:

- `customElements.get('glic-selection-overlay')`
- `document.adoptedStyleSheets`
- `shadowRoot.adoptedStyleSheets`
- `CSS.paintWorklet`
- CSS custom properties used by GLIC
- Mojo globals

All of those are scoped to the current document/realm.

## What Your Animation Observation Means

You observed that when Gemini/GLIC rectangle selection starts, page interaction is blocked and the moving animation appears to stop.

There are two possible mechanisms:

1. **Page rendering actually stalls**: the page's `requestAnimationFrame` loop stops or gets delayed while GLIC owns the interaction.
2. **Page rendering continues behind a static screenshot**: GLIC displays a screenshot canvas over the tab, so the real page may still run, but the user sees the static overlay image.

The test page distinguishes these:

- If `Render Frames` continues increasing while the ball looks frozen, the page is still rendering but hidden behind a static overlay/screenshot.
- If `Render Frames` stops increasing or `Render Stalls` increases sharply, page rendering itself is being paused or delayed.
- If events stop but frames continue, GLIC is mainly intercepting input.
- If both events and frames stop, the page is experiencing stronger modal/browser overlay suppression.

## Can This Be Detected Without False Positives?

A GLIC-specific zero-false-positive detector from normal page JavaScript is not realistic based on the observed architecture.

What is possible is a page-side heuristic for:

```text
visible page + recent selection/user activation + input/event silence + focus change and/or render stall
```

That can indicate a browser-level overlay or selection UI, but not uniquely GLIC.

Likely false-positive sources include:

- Chrome screenshot/region tools
- browser permission prompts
- extension overlays
- operating-system modals
- DevTools/window focus changes
- heavy main-thread stalls
- tab/window deactivation

A careful detector should therefore avoid saying "GLIC detected" and instead report something like:

```text
Probable browser overlay/input capture
```

## Practical Page-Side Heuristic

The test page now computes an Overlay Capture Score from page-visible signals:

- Document is still visible.
- Page focus is lost while visible.
- Recent selection exists.
- Event flow goes quiet after recent pointer/selection activity.
- `requestAnimationFrame` stalls while visible.
- Render frame gap grows above a threshold.
- Page resumes after the suspected overlay closes.

This is useful for experiments because it measures the behavior you observed. It is not a reliable identity check for GLIC.

## Reliable GLIC-Specific Options

Reliable GLIC-specific detection requires browser-level privileges:

- Chrome extension with `chrome.debugger.getTargets()`.
- DevTools Protocol target enumeration.
- Code execution inside `chrome-untrusted://glic/selection-overlay/`.
- Browser instrumentation or Chromium patching.

Normal website JavaScript does not have access to those surfaces.
