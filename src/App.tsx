/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Editor shell: toolbar, hierarchy, viewport, inspector and status bar.
 */

import TopBar from './editor/TopBar';
import Hierarchy from './editor/Hierarchy';
import Inspector from './editor/Inspector';
import StatusBar from './editor/StatusBar';
import Viewport from './render/Viewport';

export default function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Hierarchy />
        <div className="relative min-w-0 flex-1 bg-black">
          <Viewport />
        </div>
        <Inspector />
      </div>
      <StatusBar />
    </div>
  );
}
