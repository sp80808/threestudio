/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Viewport display preferences (not part of the saved document).
 */

import { create } from 'zustand';

interface ViewStore {
  showColliders: boolean;
  showGrid: boolean;
  /** When true the transform gizmo is hidden for a clean look. */
  hideGizmo: boolean;
  toggleColliders: () => void;
  toggleGrid: () => void;
  toggleGizmo: () => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  showColliders: true,
  showGrid: true,
  hideGizmo: false,
  toggleColliders: () => set((state) => ({ showColliders: !state.showColliders })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleGizmo: () => set((state) => ({ hideGizmo: !state.hideGizmo })),
}));
