figma.showUI(__html__, { width: 900, height: 600, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'GENERATE_SCALE') {
    const { rawNodes } = msg;

    // Group nodes by scaleName
    const groups: { [key: string]: any[] } = {};
    rawNodes.forEach((node: any) => {
      const name = node.scaleName || "Default Scale";
      if (!groups[name]) groups[name] = [];
      groups[name].push(node);
    });

    const mainContainer = figma.createFrame();
    mainContainer.name = "Scaly Palettes";
    mainContainer.layoutMode = "VERTICAL";
    mainContainer.primaryAxisSizingMode = "AUTO";
    mainContainer.counterAxisSizingMode = "AUTO";
    mainContainer.itemSpacing = 40;
    mainContainer.fills = [];

    // Load fonts
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });

    for (const scaleName of Object.keys(groups)) {
      const scaleNodes = groups[scaleName];
      
      const scaleFrame = figma.createFrame();
      scaleFrame.name = scaleName;
      scaleFrame.layoutMode = "VERTICAL";
      scaleFrame.primaryAxisSizingMode = "AUTO";
      scaleFrame.counterAxisSizingMode = "AUTO";
      scaleFrame.itemSpacing = 12;
      scaleFrame.fills = [];

      const title = figma.createText();
      title.characters = scaleName;
      title.fontSize = 18;
      title.fontName = { family: "Inter", style: "Bold" };
      scaleFrame.appendChild(title);

      const parentFrame = figma.createFrame();
      parentFrame.name = "Steps";
      parentFrame.layoutMode = "HORIZONTAL";
      parentFrame.primaryAxisSizingMode = "AUTO";
      parentFrame.counterAxisSizingMode = "AUTO";
      parentFrame.itemSpacing = 16;
      parentFrame.paddingLeft = 40;
      parentFrame.paddingRight = 40;
      parentFrame.paddingTop = 40;
      parentFrame.paddingBottom = 40;
      parentFrame.cornerRadius = 24;
      parentFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      scaleFrame.appendChild(parentFrame);

      scaleNodes.forEach((node: any) => {
        const colContainer = figma.createFrame();
        const labelValue = node.label;
        colContainer.name = `Scale-${labelValue}`;
        colContainer.layoutMode = "VERTICAL";
        colContainer.primaryAxisSizingMode = "AUTO";
        colContainer.counterAxisSizingMode = "AUTO";
        colContainer.itemSpacing = 8;
        colContainer.fills = [];

        const rect = figma.createRectangle();
        rect.name = `Scale-${labelValue}`;
        rect.resize(80, 80);
        rect.cornerRadius = 12;
        rect.fills = [{ 
          type: 'SOLID', 
          color: { 
            r: node.rgb[0], 
            g: node.rgb[1], 
            b: node.rgb[2] 
          } 
        }];
        colContainer.appendChild(rect);

        const label = figma.createText();
        label.characters = String(labelValue);
        label.fontSize = 14;
        label.fontName = { family: "Inter", style: "Bold" };
        colContainer.appendChild(label);

        if (node.hex) {
          const hexLabel = figma.createText();
          hexLabel.characters = node.hex.toUpperCase();
          hexLabel.fontSize = 12;
          hexLabel.fontName = { family: "Inter", style: "Regular" };
          hexLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          colContainer.appendChild(hexLabel);
        }

        if (node.isAnchor) {
          const anchorLabel = figma.createText();
          anchorLabel.characters = "Anchor";
          anchorLabel.fontSize = 10;
          anchorLabel.fontName = { family: "Inter", style: "Bold" };
          anchorLabel.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 1 } }];
          colContainer.appendChild(anchorLabel);
        }

        parentFrame.appendChild(colContainer);
      });

      mainContainer.appendChild(scaleFrame);
    }

    figma.currentPage.appendChild(mainContainer);
    figma.currentPage.selection = [mainContainer];
    figma.viewport.scrollAndZoomIntoView([mainContainer]);
  }

  if (msg.type === 'GET_COLLECTIONS') {
    (async () => {
      try {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const variables = await figma.variables.getLocalVariablesAsync();
        
        const collectionData = collections.map(c => {
          const varsInCollection = variables.filter(v => v.variableCollectionId === c.id);
          const groupSet = new Set<string>();
          
          varsInCollection.forEach(v => {
            const parts = v.name.split('/');
            if (parts.length > 1) {
              const groupPath = parts.slice(0, -1).join('/');
              groupSet.add(groupPath);
            }
          });
          
          return { 
            id: c.id, 
            name: c.name, 
            groups: Array.from(groupSet) 
          };
        });
        
        figma.ui.postMessage({ type: 'COLLECTIONS_DATA', collections: collectionData });
      } catch (e: any) {
        figma.notify(`❌ Error fetching collections: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'CREATE_VARIABLES') {
    const { rawNodes, collectionName, groupName } = msg;
    
    const groups: { [key: string]: any[] } = {};
    rawNodes.forEach((node: any) => {
      const name = node.scaleName || "Default Scale";
      if (!groups[name]) groups[name] = [];
      groups[name].push(node);
    });

    (async () => {
      try {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        let collection = collections.find(c => c.name === collectionName);
        if (!collection) {
          collection = figma.variables.createVariableCollection(collectionName);
        }
        
        const modeId = collection.defaultModeId;
        let variablesCount = 0;
        
        const existingVariables = await figma.variables.getLocalVariablesAsync("COLOR");

        for (const scaleName of Object.keys(groups)) {
          const scaleNodes = groups[scaleName];
          
          for (const node of scaleNodes) {
            const baseName = `${scaleName}/${node.label}`;
            const variableName = groupName ? `${groupName}/${baseName}` : baseName;
            
            const colorValue = { r: node.rgb[0], g: node.rgb[1], b: node.rgb[2] };
            
            let variable = existingVariables.find(
              v => v.name === variableName && v.variableCollectionId === collection!.id
            );
            
            if (!variable) {
              variable = figma.variables.createVariable(variableName, collection, "COLOR");
            }
            
            variable.setValueForMode(modeId, colorValue);
            variablesCount++;
          }
        }
        
        figma.notify(`✅ ${variablesCount} variables created/updated in "${collectionName}"!`);
      } catch (e: any) {
        figma.notify(`❌ Error: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'GET_STYLES') {
    (async () => {
      try {
        const styles = await figma.getLocalPaintStylesAsync();
        const groupSet = new Set<string>();
        
        styles.forEach(s => {
          const parts = s.name.split('/');
          if (parts.length > 1) {
            const groupPath = parts.slice(0, -1).join('/');
            groupSet.add(groupPath);
          }
        });
        
        figma.ui.postMessage({ type: 'STYLES_DATA', groups: Array.from(groupSet) });
      } catch (e: any) {
        figma.notify(`❌ Error fetching styles: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'CREATE_STYLES') {
    const { rawNodes, groupName } = msg;
    (async () => {
      try {
        const existingStyles = await figma.getLocalPaintStylesAsync();
        let stylesCount = 0;
        
        for (const node of rawNodes) {
          const baseName = `${node.scaleName}/${node.label}`;
          const styleName = groupName ? `${groupName}/${baseName}` : baseName;
          
          let style = existingStyles.find(s => s.name === styleName);
          if (!style) {
            style = figma.createPaintStyle();
            style.name = styleName;
          }
          
          const colorPaint: SolidPaint = {
            type: "SOLID",
            color: { r: node.rgb[0], g: node.rgb[1], b: node.rgb[2] }
          };
          style.paints = [colorPaint];
          stylesCount++;
        }
        
        figma.notify(`✨ Successfully created/updated ${stylesCount} paint styles!`);
      } catch (e: any) {
        figma.notify(`❌ Error creating styles: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'cancel' || msg.type === 'CANCEL') {
    figma.closePlugin();
  }
};
