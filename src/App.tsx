/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import TopBar from './editor/TopBar';
import Hierarchy from './editor/Hierarchy';
import Inspector from './editor/Inspector';
import Viewport from './render/Viewport';

export default function App() {
  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Hierarchy />
        <div className="flex-1 relative bg-black">
          <Viewport />
        </div>
        <Inspector />
      </div>
    </div>
  );
}
