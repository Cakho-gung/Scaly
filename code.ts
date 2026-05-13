function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

figma.showUI(__html__, { width: 800, height: 750, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-palette') {
    const { scale, warningScale, name } = msg;

    const parentFrame = figma.createFrame();
    parentFrame.name = `Color Scale: ${name}`;
    parentFrame.layoutMode = "VERTICAL";
    parentFrame.counterAxisSizingMode = "AUTO";
    parentFrame.itemSpacing = 40;
    parentFrame.paddingLeft = 40;
    parentFrame.paddingRight = 40;
    parentFrame.paddingTop = 40;
    parentFrame.paddingBottom = 40;
    parentFrame.cornerRadius = 24;
    parentFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    // Load font for labels
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });

    const createRow = (title: string, colors: any[]) => {
      const sectionFrame = figma.createFrame();
      sectionFrame.name = title;
      sectionFrame.layoutMode = "VERTICAL";
      sectionFrame.counterAxisSizingMode = "AUTO";
      sectionFrame.itemSpacing = 16;
      sectionFrame.fills = []; // Transparent

      const titleText = figma.createText();
      titleText.characters = title;
      titleText.fontSize = 18;
      titleText.fontName = { family: "Inter", style: "Bold" };
      sectionFrame.appendChild(titleText);

      const rowFrame = figma.createFrame();
      rowFrame.name = "Colors";
      rowFrame.layoutMode = "HORIZONTAL";
      rowFrame.counterAxisSizingMode = "AUTO";
      rowFrame.itemSpacing = 12;
      rowFrame.fills = [];

      colors.forEach(item => {
        const colContainer = figma.createFrame();
        colContainer.name = item.key;
        colContainer.layoutMode = "VERTICAL";
        colContainer.counterAxisSizingMode = "AUTO";
        colContainer.itemSpacing = 8;
        colContainer.fills = [];

        const rect = figma.createRectangle();
        rect.resize(64, 64);
        rect.cornerRadius = 8;
        rect.fills = [{ type: 'SOLID', color: hexToRgb(item.hex) }];
        colContainer.appendChild(rect);

        const label = figma.createText();
        label.characters = item.key;
        label.fontSize = 11;
        label.fontName = { family: "Inter", style: "Bold" };
        colContainer.appendChild(label);

        const hexLabel = figma.createText();
        hexLabel.characters = item.hex.toUpperCase();
        hexLabel.fontSize = 10;
        hexLabel.fontName = { family: "Inter", style: "Regular" };
        hexLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
        colContainer.appendChild(hexLabel);

        rowFrame.appendChild(colContainer);
      });

      sectionFrame.appendChild(rowFrame);
      return sectionFrame;
    };

    parentFrame.appendChild(createRow("Shade Scale", scale));
    parentFrame.appendChild(createRow("Warning Scale", warningScale));

    figma.currentPage.appendChild(parentFrame);
    figma.currentPage.selection = [parentFrame];
    figma.viewport.scrollAndZoomIntoView([parentFrame]);
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
