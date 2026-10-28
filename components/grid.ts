import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export const gridTheme = themeQuartz.withParams({
  fontFamily: "IBM Plex Sans, system-ui, sans-serif",
  fontSize: 14,
  foregroundColor: "#131416",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#ffffff",
  headerTextColor: "#5d5f60",
  headerFontSize: 12,
  headerFontWeight: 500,
  borderColor: "#e8eaec",
  rowBorder: { color: "#f0f1f2" },
  wrapperBorder: false,
  headerColumnBorder: false,
  columnBorder: false,
  rowHeight: 56,
  headerHeight: 40,
  accentColor: "#1b6c80",
  selectedRowBackgroundColor: "#ebedee",
  rowHoverColor: "#f4f6f8",
  cellHorizontalPadding: 12,
});
