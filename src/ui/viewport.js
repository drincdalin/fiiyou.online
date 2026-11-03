// Phones: while the on-screen keyboard is open, mark <html class="kb">. polish.css hides the bottom tab bar then, so the chat field
// (and anything else you type into) gets the room instead of sitting on top of a bar nobody can use right now.
// visualViewport shrinks when the keyboard opens in every phone browser; a focused field + a clearly smaller viewport = keyboard.
export function watchKeyboard() {
  const vv = window.visualViewport; if (!vv) return;
  const root = document.documentElement; let full = vv.height;
  const editing = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  const update = () => {
    const phone = matchMedia('(max-width: 700px)').matches;
    if (!editing()) full = vv.height;   // nothing focused: this is the full height (also follows rotation and the address bar)
    root.classList.toggle('kb', phone && editing() && full - vv.height > 140);
  };
  vv.addEventListener('resize', update); addEventListener('focusin', update); addEventListener('focusout', () => setTimeout(update, 60));
}
