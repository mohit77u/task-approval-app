import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  /** True while the API layer is retrying against an idle backend; drives the "waking up" banner. */
  serverWaking: boolean;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: { serverWaking: false } as UiState,
  reducers: {
    setServerWaking: (state, action: PayloadAction<boolean>) => {
      state.serverWaking = action.payload;
    },
  },
});

export const { setServerWaking } = uiSlice.actions;
export default uiSlice.reducer;
