// Picture Machines: the list of machines and the knobs each one has. The page builds its controls from
// this list and the worker runs the machine with the same names, so a new machine is one entry here
// and one function in m2d.js or m3d.js.
const seg = (id, label, opts, def) => ({ id, type: 'seg', label, opts, def });
const range = (id, label, min, max, step, def, unit = '') => ({ id, type: 'range', label, min, max, step, def, unit });
const toggle = (id, label, def) => ({ id, type: 'toggle', label, def });
// only(control, test): the control is only shown while test(settings) is true (it would do nothing otherwise)
const only = (c, when) => Object.assign(c, { when });

export const MACHINES = [
  { id: 'paint', name: 'Paint', kind: 'pic', icon: 'brush', blurb: 'Real brush strokes that follow the shapes', controls: [
    seg('brush', 'Brush', [['chunky', 'Chunky'], ['normal', 'Normal'], ['fine', 'Fine'], ['ultrafine', 'Ultra fine']], 'normal'),
    range('detail', 'Detail', 0, 100, 1, 50), range('seed', 'Shuffle the strokes', 1, 99, 1, 7),
    toggle('canvas', 'Linen canvas and thick paint', true), toggle('bristle', 'Bristle marks', true)] },
  { id: 'comic', name: 'Comic', kind: 'pic', icon: 'comic', blurb: 'Flat colours, ink lines and printing dots', controls: [
    seg('style', 'Style', [['clean', 'Clean'], ['retro', 'Retro'], ['press', 'Press'], ['poster', 'Poster'], ['manga', 'Manga']], 'retro'),
    only(range('colors', 'Colours', 3, 16, 1, 9), (o) => o.style !== 'press' && o.style !== 'manga'), range('ink', 'Ink thickness', 0, 3, 0.1, 1.2), only(range('punch', 'Colour punch', 0.4, 1.8, 0.05, 1.25), (o) => o.style !== 'manga'),
    only(range('dots', 'Dot size', 0.5, 3, 0.1, 1), (o) => o.style !== 'clean' && o.style !== 'poster'), only(toggle('slip', 'The press slips a little', true), (o) => o.style === 'press'), toggle('frame', 'Panel frame', true)] },
  { id: 'pixel', name: 'Pixel', kind: 'pic', icon: 'pixel', blurb: 'Big pixels and few colours, like an old game', controls: [
    range('size', 'Pixels across', 24, 160, 4, 72),
    seg('palette', 'Colours from', [['auto', 'The photo'], ['pico', 'Pico'], ['console', 'Console'], ['gameboy', 'Handheld'], ['press', 'Print press'], ['mono', 'Grey']], 'auto'),
    only(range('colors', 'How many colours', 2, 32, 1, 16), (o) => o.palette === 'auto'), seg('dither', 'Shading', [['none', 'Flat'], ['pattern', 'Pattern'], ['smooth', 'Speckle']], 'pattern'), toggle('grid', 'Show the grid', false)] },
  { id: 'sketch', name: 'Sketch', kind: 'pic', icon: 'pencil', blurb: 'A pencil or ink drawing on cream paper', controls: [
    seg('style', 'Drawn with', [['pencil', 'Pencil'], ['colour', 'Coloured pencils'], ['ink', 'Ink pen']], 'pencil'),
    range('dark', 'Darkness', 0, 100, 1, 50), range('weight', 'Line weight', 0.4, 2, 0.1, 1), only(range('detail', 'Detail', 0, 100, 1, 60), (o) => o.style !== 'ink')] },
  { id: 'glass', name: 'Stained glass', kind: 'pic', icon: 'glass', blurb: 'Pieces of coloured glass held by dark lead', controls: [
    range('pieces', 'Pieces across', 12, 90, 1, 38), range('lead', 'Lead thickness', 0.5, 3, 0.1, 1.2), range('glow', 'Colour glow', 0, 100, 1, 45),
    toggle('follow', 'Cut along the picture’s edges', true), range('seed', 'Shuffle the pieces', 1, 99, 1, 4)] },
  { id: 'bricks', name: 'Bricks', kind: 'pic', icon: 'brick', blurb: 'Built from toy bricks, with a parts list', controls: [
    range('size', 'Studs across', 16, 96, 2, 48)] },
  { id: 'poster', name: 'Poster print', kind: 'pic', icon: 'poster', blurb: 'Two or three inks, printed a little off', controls: [
    seg('inks', 'Inks', [['sunset', 'Red and blue'], ['candy', 'Pink and teal'], ['trio', 'Yellow, pink, blue'], ['noir', 'Orange and black'], ['forest', 'Sun, green, purple']], 'trio'),
    seg('screen', 'Printed as', [['grain', 'Grain'], ['dots', 'Dots']], 'grain'), range('grain', 'Grain size', 1, 4, 0.1, 2), range('slip', 'Misprint', 0, 4, 0.1, 1.5)] },
  { id: 'litho', name: 'Lithophane', kind: 'print', icon: 'lamp', blurb: 'A plate that shows the picture when lit from behind', controls: [
    seg('shape', 'Shape', [['rect', 'Card'], ['rounded', 'Rounded'], ['circle', 'Round'], ['hex', 'Hexagon']], 'rounded'),
    range('width', 'Width', 40, 180, 5, 90, 'mm'), range('min', 'Thinnest', 0.6, 1.2, 0.1, 0.8, 'mm'), range('max', 'Thickest', 2, 5, 0.1, 3, 'mm'), range('border', 'Frame', 0, 8, 0.5, 2, 'mm'),
    seg('quality', 'Quality', [['draft', 'Draft'], ['normal', 'Normal'], ['fine', 'Fine']], 'normal'), toggle('invert', 'Negative', false), toggle('hole', 'Hanging hole', false)] },
  { id: 'cutter', name: 'Cookie cutter', kind: 'print', icon: 'cutter', blurb: 'A cutter in the shape of the thing in the picture', controls: [
    range('size', 'Cookie size', 40, 140, 5, 80, 'mm'), range('sense', 'How much counts as background', 0, 100, 1, 55), range('smooth', 'Smooth the outline', 0, 3, 0.1, 1),
    range('blade', 'Blade width', 0.6, 1.6, 0.1, 0.8, 'mm'), range('height', 'Blade height', 8, 25, 1, 14, 'mm'), range('rim', 'Rim width', 3, 8, 0.5, 4.5, 'mm')] },
  { id: 'stamp', name: 'Stamp', kind: 'print', icon: 'stamp', blurb: 'The dark parts stand up, mirrored, ready for ink', controls: [
    range('width', 'Width', 20, 90, 5, 45, 'mm'), range('cut', 'How dark counts as ink', 15, 85, 1, 50), range('smooth', 'Smooth the shapes', 0, 3, 0.1, 1),
    range('relief', 'Raised by', 0.8, 3, 0.1, 1.6, 'mm'), range('block', 'Block thickness', 3, 15, 1, 5, 'mm')] },
  { id: 'tag', name: 'Keychain tag', kind: 'print', icon: 'tag', blurb: 'A small two-colour tag with a hole for a ring', controls: [
    seg('shape', 'Shape', [['rounded', 'Rounded'], ['circle', 'Round'], ['rect', 'Square corners']], 'rounded'),
    range('width', 'Width', 25, 70, 1, 40, 'mm'), range('cut', 'How dark counts as raised', 15, 85, 1, 50), range('smooth', 'Smooth the shapes', 0, 3, 0.1, 1),
    range('base', 'Base', 1.2, 3, 0.2, 2, 'mm'), range('raise', 'Raised by', 0.4, 1.6, 0.2, 0.8, 'mm'), toggle('rim', 'Raised rim', true)] },
];
export const BY_ID = Object.fromEntries(MACHINES.map((m) => [m.id, m]));
export const defaults = (id) => Object.fromEntries(BY_ID[id].controls.map((c) => [c.id, c.def]));
