import type { Library, Page } from './model'

/**
 * What's in OneNote the first time it opens (after that, it's whatever she's made of it). Edit
 * freely: notebooks, their sections, their pages; a page's blocks are note containers (HTML) and
 * pictures, placed on the page in px.
 */
const t0 = new Date('2025-12-09T22:02:00').getTime()
const todo = (on = false) => `<span class="ros-tag ros-tag-todo" data-on="${on ? 1 : 0}" contenteditable="false"></span>&nbsp;`
const star = `<span class="ros-tag ros-tag-star" contenteditable="false"></span>&nbsp;`

const page = (id: string, title: string, created: number, blocks: Page['blocks'], extra: Partial<Page> = {}): Page => ({ id, title, created, level: 0, blocks, ink: [], ...extra })

export function seedLibrary(): Library {
  return {
    version: 1,
    at: { notebook: 'nb-rina', section: 'sec-quick', page: 'pg-welcome' },
    notebooks: [
      {
        id: 'nb-rina',
        name: "Rina's Notebook",
        color: '#7719aa',
        sections: [
          {
            id: 'sec-quick',
            name: 'Quick Notes',
            color: '#b49edc',
            pages: [
              page('pg-welcome', 'Welcome to RinaOS', t0, [
                {
                  id: 'b1',
                  kind: 'text',
                  x: 48,
                  y: 24,
                  w: 520,
                  html: `<p>Hi Rina! This OneNote is all yours 💜</p><p>Everything saves on its own, so there's no save button, just like the real one.</p>`,
                },
                {
                  id: 'b2',
                  kind: 'text',
                  x: 48,
                  y: 150,
                  w: 420,
                  html: `<h2>Try it</h2><p>${todo(true)}Click anywhere on the page and start typing</p><p>${todo()}Drag a note by the bar along its top</p><p>${todo()}Draw on the page with the pens under <b>Draw</b></p><p>${todo()}Right-click a section to rename it or give it a colour</p><p>${todo()}Make a page a subpage from its right-click menu</p>`,
                },
                {
                  id: 'b3',
                  kind: 'text',
                  x: 500,
                  y: 176,
                  w: 260,
                  html: `<p>${star}<span style="background-color: rgb(255, 255, 0);">Tip:</span> the ribbon has your To Do boxes, stars and highlighter, same as always.</p>`,
                },
              ]),
            ],
          },
          {
            id: 'sec-bio',
            name: 'Biochem',
            color: '#8cbf7b',
            pages: [
              page('pg-glyco', 'Glycolysis', t0, [
                {
                  id: 'g1',
                  kind: 'text',
                  x: 48,
                  y: 24,
                  w: 470,
                  html: `<h2>Glucose → 2 pyruvate</h2><ol><li>Glucose → G6P <i>(hexokinase)</i></li><li>G6P → F6P <i>(phosphoglucose isomerase)</i></li><li>F6P → F-1,6-BP <i>(<span style="background-color: rgb(255, 255, 0);">PFK-1</span>: the committed step)</i></li><li>F-1,6-BP → GAP + DHAP <i>(aldolase)</i></li><li>DHAP → GAP <i>(TIM)</i></li><li>GAP → 1,3-BPG <i>(GAPDH)</i></li><li>1,3-BPG → 3PG <i>(phosphoglycerate kinase)</i></li><li>3PG → 2PG <i>(phosphoglycerate mutase)</i></li><li>2PG → PEP <i>(enolase)</i></li><li>PEP → pyruvate <i>(pyruvate kinase)</i></li></ol>`,
                },
                {
                  id: 'g2',
                  kind: 'text',
                  x: 540,
                  y: 60,
                  w: 230,
                  html: `<p>${star}Net: <b>2 ATP, 2 NADH</b></p><p>Irreversible: hexokinase, PFK-1, pyruvate kinase</p>`,
                },
              ]),
              page('pg-tca', 'TCA cycle', t0 + 86400000, [
                { id: 't1', kind: 'text', x: 48, y: 24, w: 480, html: `<p>Acetyl-CoA + oxaloacetate → citrate …</p>` },
              ], { level: 1 }),
            ],
          },
          {
            id: 'sec-todo',
            name: 'To Do',
            color: '#f5d270',
            pages: [
              page('pg-list', 'This week', t0, [
                { id: 'l1', kind: 'text', x: 48, y: 24, w: 420, html: `<p>${todo()}Practice exam</p><p>${todo()}Lab report</p><p>${todo(true)}Groceries</p>` },
              ], { paper: '#fdf8e1', rules: 'college' }),
            ],
          },
        ],
      },
    ],
  }
}
