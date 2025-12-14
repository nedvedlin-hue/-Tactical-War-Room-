import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Undo, 
  Trash2, 
  Download, 
  Upload, 
  Type, 
  Circle, 
  Navigation,
  MousePointer2,
  Eraser,
  Move,
  Minus,
  AlignJustify
} from 'lucide-react';

// Access the global fabric instance loaded via CDN
const fabric = (window as any).fabric;

// Helper to generate block arrow SVG path
// Optimized for a sharper, more tactical look
const generateArrowPath = (x1: number, y1: number, x2: number, y2: number, thickness: number) => {
    // Ratios for a tactical arrow
    const headLength = thickness * 3.5; // Longer head
    const headWidth = thickness * 3;    // Wider head base
    const shaftWidth = thickness;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Minimum length check
    if (length < headLength) {
        return ""; 
    }

    // Normalized direction vector
    const ux = dx / length;
    const uy = dy / length;
    
    // Normal vector (perpendicular)
    const nx = -uy;
    const ny = ux;
    
    const shaftLength = length - headLength;
    
    // Points calculation
    // 1. Tail Left
    const p1x = x1 + nx * (shaftWidth / 2);
    const p1y = y1 + ny * (shaftWidth / 2);
    
    // 2. Shaft End Left (Shoulder Inner)
    const p2x = x1 + ux * shaftLength + nx * (shaftWidth / 2);
    const p2y = y1 + uy * shaftLength + ny * (shaftWidth / 2);
    
    // 3. Head Left (Shoulder Outer)
    const p3x = x1 + ux * shaftLength + nx * (headWidth / 2);
    const p3y = y1 + uy * shaftLength + ny * (headWidth / 2);
    
    // 4. Tip
    const p4x = x2;
    const p4y = y2;
    
    // 5. Head Right
    const p5x = x1 + ux * shaftLength - nx * (headWidth / 2);
    const p5y = y1 + uy * shaftLength - ny * (headWidth / 2);
    
    // 6. Shaft End Right
    const p6x = x1 + ux * shaftLength - nx * (shaftWidth / 2);
    const p6y = y1 + uy * shaftLength - ny * (shaftWidth / 2);
    
    // 7. Tail Right
    const p7x = x1 - nx * (shaftWidth / 2);
    const p7y = y1 - ny * (shaftWidth / 2);

    return `M ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y} L ${p4x} ${p4y} L ${p5x} ${p5y} L ${p6x} ${p6y} L ${p7x} ${p7y} Z`;
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // App State
  const [pieceName, setPieceName] = useState<string>('Infantry');
  const [pieceColor, setPieceColor] = useState<string>('#ef4444');
  const [history, setHistory] = useState<string[]>([]);
  const [tool, setTool] = useState<'select' | 'arrow'>('select');
  const [arrowThickness, setArrowThickness] = useState<number>(6); // Default thinner
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for Event Listeners (avoid stale closures)
  const historyRef = useRef<string[]>([]);
  const colorRef = useRef(pieceColor);
  const toolRef = useRef(tool);
  const thicknessRef = useRef(arrowThickness);
  
  // Drawing Refs
  const isDrawingRef = useRef(false);
  const arrowStartRef = useRef<{x: number, y: number} | null>(null);
  const tempArrowRef = useRef<any>(null);

  // Sync refs with state
  useEffect(() => { colorRef.current = pieceColor; }, [pieceColor]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { thicknessRef.current = arrowThickness; }, [arrowThickness]);

  // --- History Logic ---

  const saveHistory = useCallback(() => {
    if (!fabricCanvasRef.current || isProcessing) return;
    const json = JSON.stringify(fabricCanvasRef.current.toJSON());
    if (historyRef.current.length > 0) {
      const lastState = historyRef.current[historyRef.current.length - 1];
      if (lastState === json) return;
    }
    historyRef.current.push(json);
    if (historyRef.current.length > 50) historyRef.current.shift();
    setHistory([...historyRef.current]);
  }, [isProcessing]);

  const handleUndo = useCallback(() => {
    if (!fabricCanvasRef.current || historyRef.current.length <= 1) return;
    setIsProcessing(true);
    historyRef.current.pop();
    const prevState = historyRef.current[historyRef.current.length - 1];
    fabricCanvasRef.current.loadFromJSON(JSON.parse(prevState), () => {
      fabricCanvasRef.current.renderAll();
      setHistory([...historyRef.current]);
      setIsProcessing(false);
    });
  }, []);

  // --- Tool Switching Effect ---
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (tool === 'arrow') {
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.selection = false;
        canvas.forEachObject((o: any) => o.set('selectable', false));
    } else {
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.selection = true;
        canvas.forEachObject((o: any) => o.set('selectable', true));
    }
    canvas.requestRenderAll();
  }, [tool]);

  // --- Initialization ---

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: '#e5e7eb',
      stopContextMenu: true,
    });

    fabricCanvasRef.current = canvas;

    const resizeCanvas = () => {
      if (containerRef.current) {
        canvas.setWidth(containerRef.current.clientWidth);
        canvas.setHeight(containerRef.current.clientHeight);
        canvas.renderAll();
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    saveHistory();

    canvas.on('object:added', () => { if(!isDrawingRef.current) saveHistory() });
    canvas.on('object:modified', saveHistory);
    canvas.on('object:removed', saveHistory);

    // Mouse Events
    let isPanning = false;
    let lastPosX = 0;
    let lastPosY = 0;

    canvas.on('mouse:down', (opt: any) => {
      const evt = opt.e;
      
      // Pan (Alt or Middle Click) takes precedence
      if (evt.altKey === true || evt.button === 1) {
        isPanning = true;
        canvas.selection = false;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        canvas.defaultCursor = 'grab';
        return;
      }

      // Arrow Drawing Start
      if (toolRef.current === 'arrow') {
          isDrawingRef.current = true;
          const pointer = canvas.getPointer(evt);
          arrowStartRef.current = { x: pointer.x, y: pointer.y };
          // Disable selection again just in case
          canvas.selection = false;
      }
    });

    canvas.on('mouse:move', (opt: any) => {
      // Pan Update
      if (isPanning) {
        const e = opt.e;
        const vpt = canvas.viewportTransform;
        vpt[4] += e.clientX - lastPosX;
        vpt[5] += e.clientY - lastPosY;
        canvas.requestRenderAll();
        lastPosX = e.clientX;
        lastPosY = e.clientY;
        return;
      }

      // Arrow Drawing Update
      if (toolRef.current === 'arrow' && isDrawingRef.current && arrowStartRef.current) {
          const pointer = canvas.getPointer(opt.e);
          const pathString = generateArrowPath(
              arrowStartRef.current.x, 
              arrowStartRef.current.y, 
              pointer.x, 
              pointer.y,
              thicknessRef.current // Use dynamic thickness
          );
          
          if (tempArrowRef.current) {
              canvas.remove(tempArrowRef.current);
          }

          if (pathString) {
              tempArrowRef.current = new fabric.Path(pathString, {
                  fill: colorRef.current,
                  stroke: 'white',
                  strokeWidth: 2,
                  originX: 'left',
                  originY: 'top',
                  selectable: false,
                  evented: false,
                  opacity: 0.8
              });
              canvas.add(tempArrowRef.current);
          }
          canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:up', () => {
      // Pan End
      if (isPanning) {
        canvas.setViewportTransform(canvas.viewportTransform);
        isPanning = false;
        canvas.defaultCursor = toolRef.current === 'arrow' ? 'crosshair' : 'default';
        return;
      }

      // Arrow Drawing End
      if (toolRef.current === 'arrow' && isDrawingRef.current) {
          isDrawingRef.current = false;
          if (tempArrowRef.current) {
              // Finalize the arrow object properties
              tempArrowRef.current.set({
                  selectable: true,
                  evented: true,
                  hoverCursor: 'move',
                  opacity: 1,
                  transparentCorners: false,
                  cornerColor: 'white',
                  cornerStrokeColor: 'gray',
                  borderColor: 'gray',
                  cornerSize: 8,
              });
              
              // We manually invoke history save because we suppressed it during drawing
              saveHistory();
              tempArrowRef.current = null;
              arrowStartRef.current = null;
          }
      }
    });

    // Zoom
    canvas.on('mouse:wheel', (opt: any) => {
      const delta = opt.e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.1) zoom = 0.1;
      canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Keyboard
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (canvas.getActiveObject() && !(canvas.getActiveObject() as any).isEditing) {
          handleDeleteSelected();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      // ESC to cancel drawing or switch to select
      if (e.key === 'Escape') {
          if (isDrawingRef.current) {
              // Cancel current draw
              if (tempArrowRef.current) canvas.remove(tempArrowRef.current);
              isDrawingRef.current = false;
              tempArrowRef.current = null;
              canvas.requestRenderAll();
          } else {
              setTool('select');
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleUndo]); 

  // --- Helpers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvasRef.current) return;
    const reader = new FileReader();
    reader.onload = (f) => {
      const data = f.target?.result as string;
      fabric.Image.fromURL(data, (img: any) => {
        const canvas = fabricCanvasRef.current;
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        const scale = Math.min(canvas.getWidth() / img.width, canvas.getHeight() / img.height);
        img.scale(Math.min(scale, 1));
        img.set({
          left: canvas.getWidth() / 2,
          top: canvas.getHeight() / 2,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
          opacity: 0.9
        });
        canvas.getObjects().forEach((obj: any) => { if (obj.type === 'image') canvas.remove(obj); });
        canvas.add(img);
        canvas.sendToBack(img);
        canvas.renderAll();
        saveHistory();
        e.target.value = '';
      });
    };
    reader.readAsDataURL(file);
  };

  const addPiece = () => {
    // If in arrow mode, switch to select to move the new piece
    if (tool === 'arrow') setTool('select');
    
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const vpt = canvas.viewportTransform;
    const center = {
        x: (-vpt[4] + canvas.getWidth() / 2) / vpt[0],
        y: (-vpt[5] + canvas.getHeight() / 2) / vpt[3]
    };

    const circle = new fabric.Circle({
      radius: 20,
      fill: pieceColor,
      stroke: '#fff',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 4, offsetX: 2, offsetY: 2 })
    });

    const text = new fabric.Text(pieceName.substring(0, 2).toUpperCase(), {
      fontSize: 16,
      fontFamily: 'monospace',
      fill: '#fff',
      originX: 'center',
      originY: 'center',
      fontWeight: 'bold',
    });

    const group = new fabric.Group([circle, text], {
      left: center.x,
      top: center.y,
      originX: 'center',
      originY: 'center',
      transparentCorners: false,
      cornerColor: 'white',
      cornerStrokeColor: 'gray',
      borderColor: 'gray',
      cornerSize: 8,
      padding: 5,
    });

    canvas.add(group);
    canvas.setActiveObject(group);
    saveHistory();
  };

  const addText = () => {
    if (tool === 'arrow') setTool('select');

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    const center = {
        x: (-vpt[4] + canvas.getWidth() / 2) / vpt[0],
        y: (-vpt[5] + canvas.getHeight() / 2) / vpt[3]
    };
    const text = new fabric.IText('NOTES', {
      left: center.x,
      top: center.y,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fill: '#1f2937',
      fontSize: 24,
      originX: 'center',
      originY: 'center',
      shadow: new fabric.Shadow({ color: 'rgba(255,255,255,0.8)', blur: 2, offsetX: 1, offsetY: 1 })
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    saveHistory();
  };

  const handleClearBoard = () => {
      if(window.confirm("Are you sure you want to clear the tactical board?")) {
        const canvas = fabricCanvasRef.current;
        canvas.clear();
        canvas.setBackgroundColor('#e5e7eb', canvas.renderAll.bind(canvas));
        saveHistory();
      }
  }

  const handleDeleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.discardActiveObject();
      activeObjects.forEach((obj: any) => {
        canvas.remove(obj);
      });
      canvas.renderAll();
    }
  };

  const handleExport = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataURL = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
    const link = document.createElement('a');
    link.download = `war-room-tactic-${Date.now()}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden select-none">
      
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between p-3 bg-gray-800 shadow-xl border-b border-gray-700 z-10 gap-2">
        
        {/* Left: Map & Creation */}
        <div className="flex items-center space-x-2 md:space-x-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center mr-2 border-r border-gray-600 pr-4">
             <h1 className="text-xl font-black text-yellow-500 tracking-tighter hidden md:block select-none">WAR<span className="text-white">ROOM</span></h1>
             <label className="cursor-pointer ml-4 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-bold py-2 px-3 rounded flex items-center transition border border-gray-600">
               <Upload className="w-3.5 h-3.5 mr-2" />
               MAP
               <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
             </label>
          </div>

          <div className="flex items-center space-x-2 bg-gray-700/50 p-1.5 rounded-lg border border-gray-600">
            
            {/* Dynamic Content based on Tool: Show ID Input for Select Mode, Thickness for Arrow Mode */}
            {tool === 'select' ? (
                <input 
                  type="text" 
                  value={pieceName} 
                  onChange={(e) => setPieceName(e.target.value)}
                  className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded w-16 md:w-20 border border-gray-600 focus:outline-none focus:border-yellow-500 font-mono"
                  placeholder="ID"
                  maxLength={4}
                  title="Unit ID"
                />
            ) : (
                <div className="flex items-center space-x-2 px-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase mr-1 hidden lg:inline">Width</span>
                    {/* Size Presets */}
                    <div className="flex bg-gray-800 rounded border border-gray-600">
                        <button onClick={() => setArrowThickness(4)} className={`p-1 hover:bg-gray-600 ${arrowThickness === 4 ? 'bg-gray-600' : ''}`} title="Thin"><Minus className="w-3 h-3" /></button>
                        <button onClick={() => setArrowThickness(8)} className={`p-1 hover:bg-gray-600 ${arrowThickness === 8 ? 'bg-gray-600' : ''}`} title="Medium"><AlignJustify className="w-3 h-3" /></button>
                        <button onClick={() => setArrowThickness(16)} className={`p-1 hover:bg-gray-600 ${arrowThickness === 16 ? 'bg-gray-600' : ''}`} title="Thick"><AlignJustify className="w-3 h-3 stroke-[3]" /></button>
                    </div>
                    {/* Slider */}
                    <input 
                      type="range" 
                      min="2" 
                      max="30" 
                      value={arrowThickness} 
                      onChange={(e) => setArrowThickness(Number(e.target.value))}
                      className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                      title={`Thickness: ${arrowThickness}px`}
                    />
                </div>
            )}
            
            {/* Color Presets */}
            <div className="flex space-x-1 pl-1">
                {[
                  { color: '#ef4444', label: 'Red' },    // Red
                  { color: '#10b981', label: 'Green' },  // Green
                  { color: '#3b82f6', label: 'Blue' }    // Blue
                ].map((preset) => (
                    <button
                        key={preset.color}
                        onClick={() => setPieceColor(preset.color)}
                        className={`w-4 h-4 rounded-full border border-gray-500 hover:scale-110 transition-transform ${pieceColor === preset.color ? 'ring-2 ring-white scale-110' : ''}`}
                        style={{ backgroundColor: preset.color }}
                        title={`Select ${preset.label}`}
                    />
                ))}
            </div>

            <div className="h-4 w-px bg-gray-600 mx-1"></div>

            <input 
              type="color" 
              value={pieceColor} 
              onChange={(e) => setPieceColor(e.target.value)}
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-none p-0"
              title="Custom Color"
            />
            
            {/* Unit Add Button (Only visible/active in Select mode effectively, triggers switch if in arrow mode) */}
            <button 
              onClick={addPiece} 
              className={`p-1.5 rounded flex items-center shadow-lg transition ml-2 ${
                  tool === 'select' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
              title="Deploy Unit (Switch to Select Mode)"
            >
              <Circle className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-1 border-l border-gray-600 pl-4">
             {/* Tool Toggle: Select vs Arrow */}
             <div className="flex bg-gray-800 rounded-md border border-gray-600 p-0.5">
                 <button
                    onClick={() => setTool('select')}
                    className={`p-1.5 rounded transition ${
                        tool === 'select' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Select / Move Tool"
                 >
                    <Move className="w-4 h-4" />
                 </button>
                 <button
                    onClick={() => setTool('arrow')}
                    className={`p-1.5 rounded transition flex items-center ${
                        tool === 'arrow' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Arrow Tool (Drag to Draw)"
                 >
                    <Navigation className="w-4 h-4 transform rotate-90" />
                 </button>
             </div>

             <button 
              onClick={addText} 
              className="text-gray-300 hover:bg-gray-700 p-2 rounded transition"
              title="Add Label"
             >
               <Type className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 md:space-x-3">
           <div className="h-6 w-px bg-gray-600 mx-1 hidden md:block"></div>
           
           <button 
             onClick={handleUndo} 
             disabled={history.length <= 1}
             className={`flex items-center px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition border ${
               history.length <= 1 
               ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed' 
               : 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
             }`}
             title="Ctrl+Z"
           >
             <Undo className="w-3.5 h-3.5 mr-1.5" />
             Undo
           </button>

            <button 
             onClick={handleClearBoard} 
             className="p-2 rounded text-gray-400 hover:text-white hover:bg-red-900/40 transition"
             title="Clear Board"
           >
             <Eraser className="w-4 h-4" />
           </button>

           <button 
             onClick={handleDeleteSelected} 
             className="flex items-center px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-red-900/30 hover:bg-red-900/60 text-red-200 border border-red-900/50 transition"
             title="Delete Selected (Del)"
           >
             <Trash2 className="w-3.5 h-3.5 mr-1.5" />
             Del
           </button>

           <button 
             onClick={handleExport} 
             className="flex items-center px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition shadow-lg"
           >
             <Download className="w-3.5 h-3.5 mr-1.5" />
             Save
           </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative bg-gray-200 overflow-hidden" ref={containerRef}>
        <canvas ref={canvasRef} />
        
        {/* Instructions Overlay */}
        <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm text-xs text-gray-400 p-3 rounded-md pointer-events-none select-none border border-gray-700 shadow-2xl z-20">
          <p className="font-bold text-gray-200 mb-2 flex items-center uppercase tracking-wider text-[10px]"><MousePointer2 className="w-3 h-3 mr-1"/> Operations</p>
          <ul className="space-y-1.5 font-mono">
             <li className="flex items-center"><span className="bg-gray-700 text-gray-200 px-1 rounded mr-2 text-[9px] border border-gray-600 w-16 text-center inline-block">ALT+DRAG</span> Pan Map</li>
             <li className="flex items-center"><span className="bg-gray-700 text-gray-200 px-1 rounded mr-2 text-[9px] border border-gray-600 w-16 text-center inline-block">WHEEL</span> Zoom</li>
             {tool === 'arrow' && <li className="flex items-center text-yellow-400"><span className="bg-yellow-900/50 text-yellow-200 px-1 rounded mr-2 text-[9px] border border-yellow-700 w-16 text-center inline-block">DRAG</span> Draw Arrow</li>}
          </ul>
        </div>
      </div>

    </div>
  );
};

export default App;