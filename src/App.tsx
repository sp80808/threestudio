/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import TopBar from './editor/TopBar';
import Hierarchy from './editor/Hierarchy';
import Inspector from './editor/Inspector';
import RuntimeTrace from './editor/RuntimeTrace';
import Viewport from './render/Viewport';

export default function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Hierarchy />
        <div className="relative flex-1 bg-black">
          <Viewport />
          <RuntimeTrace />
        </div>
        <Inspector />
      </div>
    </div>
  );
}
