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

  if (msg.type === 'GET_VARIABLES_FOR_IMPORT') {
    (async () => {
      try {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const variables = await figma.variables.getLocalVariablesAsync("COLOR");
        
        const data = collections.map(c => {
          const vars = variables.filter(v => v.variableCollectionId === c.id);
          const groupMap: { [groupName: string]: { [scaleName: string]: any[] } } = {};
          
          vars.forEach(v => {
            const parts = v.name.split('/');
            if (parts.length < 2) return;
            
            const label = parts[parts.length - 1];
            const scaleName = parts[parts.length - 2];
            const groupPath = parts.slice(0, -2).join('/') || "Default Group";
            
            if (!groupMap[groupPath]) {
              groupMap[groupPath] = {};
            }
            if (!groupMap[groupPath][scaleName]) {
              groupMap[groupPath][scaleName] = [];
            }
            
            const firstModeId = Object.keys(v.valuesByMode)[0] || c.defaultModeId;
            const value = v.valuesByMode[firstModeId];
            if (value && typeof value === 'object' && 'r' in value) {
              const toHex = (comp: number) => Math.round(comp * 255).toString(16).padStart(2, '0');
              const hex = `#${toHex(value.r)}${toHex(value.g)}${toHex(value.b)}`;
              const hasAnchorMark = label.endsWith('*');
              const cleanLabel = hasAnchorMark ? label.slice(0, -1) : label;
              groupMap[groupPath][scaleName].push({
                label: cleanLabel,
                hex,
                isAnchor: hasAnchorMark
              });
            }
          });
          
          const groups = Object.keys(groupMap).map(groupName => {
            const scales = Object.keys(groupMap[groupName]).map(scaleName => {
              const nodes = groupMap[groupName][scaleName].sort((a, b) => {
                const numA = parseInt(a.label, 10);
                const numB = parseInt(b.label, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a.label).localeCompare(String(b.label));
              });
              
              return {
                name: scaleName,
                nodes
              };
            }).filter(s => s.nodes.length > 0);
            
            return {
              name: groupName,
              scales
            };
          }).filter(g => g.scales.length > 0);
          
          return {
            id: c.id,
            name: c.name,
            groups
          };
        }).filter(c => c.groups.length > 0);
        
        figma.ui.postMessage({ type: 'VARIABLES_IMPORT_DATA', collections: data });
      } catch (e: any) {
        figma.notify(`❌ Error fetching variables: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'GET_STYLES_FOR_IMPORT') {
    (async () => {
      try {
        const styles = await figma.getLocalPaintStylesAsync();
        const styleGroupMap: { [groupName: string]: { [scaleName: string]: any[] } } = {};
        
        styles.forEach(s => {
          if (s.paints.length === 0 || s.paints[0].type !== 'SOLID') return;
          const solid = s.paints[0] as SolidPaint;
          
          const parts = s.name.split('/');
          if (parts.length < 2) return;
          
          const label = parts[parts.length - 1];
          const scaleName = parts[parts.length - 2];
          const groupPath = parts.slice(0, -2).join('/') || "Default Group";
          
          if (!styleGroupMap[groupPath]) {
            styleGroupMap[groupPath] = {};
          }
          if (!styleGroupMap[groupPath][scaleName]) {
            styleGroupMap[groupPath][scaleName] = [];
          }
          
          const toHex = (comp: number) => Math.round(comp * 255).toString(16).padStart(2, '0');
          const hex = `#${toHex(solid.color.r)}${toHex(solid.color.g)}${toHex(solid.color.b)}`;
          
          const hasAnchorMark = label.endsWith('*');
          const cleanLabel = hasAnchorMark ? label.slice(0, -1) : label;
          styleGroupMap[groupPath][scaleName].push({
            label: cleanLabel,
            hex,
            isAnchor: hasAnchorMark
          });
        });
        
        const styleGroups = Object.keys(styleGroupMap).map(groupName => {
          const scales = Object.keys(styleGroupMap[groupName]).map(scaleName => {
            const nodes = styleGroupMap[groupName][scaleName].sort((a, b) => {
              const numA = parseInt(a.label, 10);
              const numB = parseInt(b.label, 10);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return String(a.label).localeCompare(String(b.label));
            });
            return {
              name: scaleName,
              nodes
            };
          }).filter(s => s.nodes.length > 0);
          
          return {
            name: groupName,
            scales
          };
        }).filter(g => g.scales.length > 0);
        
        figma.ui.postMessage({ type: 'STYLES_IMPORT_DATA', groups: styleGroups });
      } catch (e: any) {
        figma.notify(`❌ Error fetching styles: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'IMPORT_FROM_DESIGN') {
    (async () => {
      try {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.notify("⚠️ Please select a scale frame or color shapes on the canvas!");
          return;
        }

        const importedScales: any[] = [];

        // Helper to check if a node has solid fills and extract hex
        const getSolidFillHex = (node: SceneNode): string | null => {
          if ('fills' in node && Array.isArray(node.fills)) {
            const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
            if (solidFill) {
              const r = Math.round(solidFill.color.r * 255);
              const g = Math.round(solidFill.color.g * 255);
              const b = Math.round(solidFill.color.b * 255);
              const toHex = (c: number) => c.toString(16).padStart(2, '0');
              return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            }
          }
          return null;
        };

        // Recursive helper to parse a potential scale frame structure
        const tryParseScaleFrame = (node: SceneNode): boolean => {
          if (node.type !== 'FRAME') return false;

          // Look for child named "Steps"
          const stepsFrame = node.children.find(c => c.name === 'Steps' && c.type === 'FRAME') as FrameNode;
          if (!stepsFrame) return false;

          // Found steps frame! Now let's extract steps
          const scaleName = node.name || "Imported Scale";
          const nodesList: any[] = [];

          // Sort children of Steps horizontally (by x coordinate) or in tree order
          const stepNodes = [...stepsFrame.children].sort((a, b) => a.x - b.x);

          stepNodes.forEach((stepNode, index) => {
            // Find rectangle/vector containing the color
            let hex: string | null = null;
            let isAnchor = false;
            let label: string | number = index * 100;

            // Search children of this step container (e.g. Scale-50)
            if ('children' in stepNode) {
              const rect = stepNode.children.find(c => c.name.startsWith('Scale-') || c.type === 'RECTANGLE');
              if (rect) {
                hex = getSolidFillHex(rect);
              } else {
                // fallback, search any child with fills
                for (const child of stepNode.children) {
                  const h = getSolidFillHex(child);
                  if (h) { hex = h; break; }
                }
              }

              // Read label from text nodes
              const textNodes = stepNode.children.filter(c => c.type === 'TEXT') as TextNode[];
              const numberText = textNodes.find(t => !isNaN(Number(t.characters.trim())));
              if (numberText) {
                label = numberText.characters.trim();
              }

              // Check if marked as Anchor
              const hasAnchorTag = textNodes.some(t => t.characters.toLowerCase().includes('anchor'));
              if (hasAnchorTag) {
                isAnchor = true;
              }
            } else {
              hex = getSolidFillHex(stepNode);
            }

            if (hex) {
              nodesList.push({
                hex,
                isAnchor,
                label
              });
            }
          });

          if (nodesList.length > 0) {
            importedScales.push({
              name: scaleName,
              stepCount: nodesList.length,
              nodes: nodesList
            });
            return true;
          }

          return false;
        };

        // Try to parse each selected node
        for (const selectedNode of selection) {
          // If the selected node itself is a Scale frame
          if (tryParseScaleFrame(selectedNode)) {
            continue;
          }

          // If the selected node is the main container ("Scaly Palettes"), loop children
          if (selectedNode.type === 'FRAME' && selectedNode.name === 'Scaly Palettes') {
            for (const child of selectedNode.children) {
              tryParseScaleFrame(child);
            }
            continue;
          }

          // Search inside the selection subtree recursively for Steps frames
          if ('children' in selectedNode) {
            const findStepsFrames = (parent: FrameNode | GroupNode | ComponentNode | InstanceNode) => {
              for (const child of parent.children) {
                if (child.type === 'FRAME') {
                  if (tryParseScaleFrame(child)) {
                    // skip children once parsed
                  } else {
                    findStepsFrames(child as any);
                  }
                } else if (child.type === 'GROUP' || child.type === 'INSTANCE' || child.type === 'COMPONENT') {
                  findStepsFrames(child as any);
                }
              }
            };
            findStepsFrames(selectedNode as any);
          }
        }

        // Fallback: If no structured scale frames were found, extract all solid fills from the selection
        if (importedScales.length === 0) {
          const allColors: { hex: string, node: SceneNode }[] = [];
          
          const collectSolidFills = (curr: SceneNode) => {
            const hex = getSolidFillHex(curr);
            if (hex) {
              allColors.push({ hex, node: curr });
            }
            if ('children' in curr) {
              for (const child of curr.children) {
                collectSolidFills(child);
              }
            }
          };

          for (const selectedNode of selection) {
            collectSolidFills(selectedNode);
          }

          if (allColors.length > 0) {
            // Sort colors by luminance/lightness (from light to dark) using OKLCH/perceived lightness approximation
            const getLuminance = (hex: string) => {
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };

            // Remove duplicate hexes to keep it clean
            const uniqueHexes = Array.from(new Set(allColors.map(c => c.hex.toUpperCase())));
            uniqueHexes.sort((a, b) => getLuminance(b) - getLuminance(a)); // Lightest first

            if (uniqueHexes.length >= 2) {
              // Convert to scale nodes
              const nodesList = uniqueHexes.map((hex, index) => {
                const isFirst = index === 0;
                const isLast = index === uniqueHexes.length - 1;
                return {
                  hex: hex.toLowerCase(),
                  isAnchor: isFirst || isLast,
                  label: index === 0 ? 'white' : index === uniqueHexes.length - 1 ? 'black' : index * 100
                };
              });

              importedScales.push({
                name: "Imported Selection",
                stepCount: uniqueHexes.length - 2 > 0 ? uniqueHexes.length - 2 : 9,
                nodes: nodesList
              });
            }
          }
        }

        if (importedScales.length > 0) {
          figma.ui.postMessage({ type: 'IMPORTED_SCALES_DATA', scales: importedScales });
          figma.notify(`📥 Successfully imported ${importedScales.length} scale(s) from design selection!`);
        } else {
          figma.notify("⚠️ No valid color scales or color swatches found in selection.");
        }
      } catch (e: any) {
        figma.notify(`❌ Error importing scale: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'GET_FONTS') {
    (async () => {
      try {
        const available = await figma.listAvailableFontsAsync();
        // De-dupe to font families (each family has many styles/weights) and sort A→Z.
        const families = Array.from(new Set(available.map(f => f.fontName.family)))
          .sort((a, b) => a.localeCompare(b));
        figma.ui.postMessage({ type: 'FONTS_LIST', fonts: families });
      } catch (e: any) {
        figma.notify(`❌ Error listing fonts: ${e.message}`);
      }
    })();
  }

  if (msg.type === 'cancel' || msg.type === 'CANCEL') {
    figma.closePlugin();
  }
};
