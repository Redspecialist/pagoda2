"use strict";

/*
 * Filename: heatmapViewer.js
 * Author: Nikolas Barkas
 * Description: implements the heatmap viewer for pagoda2
 */

/**
 * Manages the heatmap viewer
 * @constructor
 */
function heatmapViewer() {
    if (typeof heatmapViewer.instance ===  'object') {
	return heatmapViewer.instance;
    }
    console.log('Initializing heatmap viewer...');

    // NOTE: Actual init is done by parent object

    var extJsContainer = Ext.getCmp('heatmapPanel');
    extJsContainer.onResize = function() {
    	var heatView = new heatmapViewer();
    	heatView.updateCanvasSize();
    	heatView.drawHeatmap();
    };

    // How to show missing values
    this.missingDisplay = 'mean';

    // Keep track of what selection we are showing so
    // we can persist accross redraws
    this.currentOverlaySelectionName = null;
    this.currentOverlaySelectionShown = false;
    heatmapViewer.instance =  this;
};


/**
 * Perform initialization of the heatmap viewer.
 * @description This is called by the
 * parent heatmapDendrogram viewer object when the dendrogram has finished
 * loading. This is dore because it is the dendrogram object that will
 * provide order for the columns here -- we can't rely on the backend
 * to do this because we will eventually need to do this clientside
 */
heatmapViewer.prototype.initialize = function() {
    // TODO: get a variable to check that this is not run twice

    // Make a clickable regions object that we will uses for the crosshair gene name
    this.geneRegions = new clickableRegions();


    // Generate our canvases

    // NOTE: We are putting two canvases in #heatmap-area-container
    // and we are positioning them directly on top of each other
    // So we can have our static heatmap on the bottom and dynamic
    // annotation (like crosshairs) on top without having
    // to redraw the bottom repeatedly

    var heatmapContainer = $('#heatmap-area-container');
    heatmapContainer.css({position: 'relative'});

    heatmapContainer.append(
    	'<canvas id="heatmap-area" ></canvas>' +
    	'<canvas id="heatmap-area-selection"></canvas>' +
    	'<canvas id="heatmap-area-overlay"></canvas>'
    );

    var heatmapArea = $('#heatmap-area');

    heatmapArea.css({
    	position: 'absolute',
    	top: 0,
    	left: 0
    });

    var heatmapAreaSelection = $('#heatmap-area-selection');
    heatmapAreaSelection.css({
      position: 'absolute',
      top: 0,
      left: 0
    });

    var heatmapAreaOverlay = $('#heatmap-area-overlay');
    heatmapAreaOverlay.css({
      	position: 'absolute',
      	top: 0,
      	left: 0,
    });

    // Setup the events handling the overlay effect of the canvas
    this.setupOverlays();

    // Update the size of both canvases
    this.updateCanvasSize();

    // initialise the display genes array
    this.displayGenes = [];

    // Palette Manager init
    this.palManager = new paletteManager();
    this.palManager.setPalette(p2globalParams.heatmapViewer.defaultPaletteName);
    this.palManager.setNumberOfColors(p2globalParams.heatmapViewer.defaultPaletteLevels);

    this.displayGenes = new Array();
    this.drawHeatmap();

    this.setRowReordering(p2globalParams.heatmapViewer.defaultRowReordering);

    this.generateMenu();
};



/**
 * Generate the palettes menu
 * @private
 * @returns palette menu extjs object
 */
heatmapViewer.prototype.generatePalettesMenu = function() {
    var paletteChangeHandler = function(item) {
        var heatView = new heatmapViewer();

        heatView.palManager.setPalette(item.value);

    		// NOTE: We are getting  the number of colors because the
    		// Manger will have sorted out any issues with exceeeding the
    		// new palette limits
    		var curNoColours = heatView.palManager.getNumberOfColors();

        // Set the actual value to the menu
        Ext.getCmp('paletteLevelsField').setValue(curNoColours);

        // Impose the new limits of this palette
        Ext.getCmp('paletteLevelsField').setMinValue(heatView.palManager.getMinNumberOfColors());
        Ext.getCmp('paletteLevelsField').setMaxValue(heatView.palManager.getMaxNumberOfColors());

    		heatView.drawHeatmap();
    };


    var palettes = p2globalParams.heatmapViewer.availablePalettes;
    var paletteMenu = Ext.create('Ext.menu.Menu');
    for (var i in palettes)    {
        paletteMenu.add({
            text: palettes[i].displayName,
	          value: palettes[i].name,
            handler: paletteChangeHandler
	    }); // paletteMenu.add
    } // for
    return paletteMenu;
}



/**
 * Generates the heatmap configuration menu
 */
heatmapViewer.prototype.generateMenu = function() {
  var toolbar = Ext.create('Ext.Toolbar');
  var heatView = this;

  var paletteMenu = this.generatePalettesMenu();

  // Menu for displaying missing values
  var missingValueChangeHandler = function(item) {
     var heatView = new heatmapViewer();
     heatView.setMissingDisplay(item.value);
     heatView.drawHeatmap();
  }
  var missingValueDisplayMenu = Ext.create('Ext.menu.Menu', {
    id: 'missingValueDisplayMenu',
    items: [{
      text: 'Mean',
      value: 'mean',
      handler: missingValueChangeHandler
    },
    {
      text: 'Min',
      value: 'min',
      handler: missingValueChangeHandler
    },
    {
      text: 'White',
      value: 'white',
      handler: missingValueChangeHandler
    },
    {
      text: 'Grey',
      value: 'grey',
      handler: missingValueChangeHandler
    },
    {
      text: 'Black',
      value: 'black',
      handler: missingValueChangeHandler
    }
    ]
  })

 var heatmapSettingsMenu = Ext.create('Ext.menu.Menu', {
	id: 'heatmapSettingsMenu',
	items: [
	    {
    		text: 'Palette Name',
    		menu: paletteMenu
	    },
	    {
	      text: 'Show missing as',
	      menu: missingValueDisplayMenu
	    },
	    {
    		fieldLabel: 'Palette Levels',
    		id: 'paletteLevelsField',
    		xtype: 'numberfield',
    		tooltip: 'Number of colors for the palette',
    		value: p2globalParams.heatmapViewer.defaultPaletteLevels, // FIXME
    		disabled: false,
    		maxValue: heatView.palManager.getMaxNumberOfColors(),
    		minValue: heatView.palManager.getMinNumberOfColors(),
    		listeners: {
		    change: {buffer: 800, fn: function(f,v) {
      			var heatView = new heatmapViewer();
      			heatView.palManager.setNumberOfColors(v);
      			heatView.drawHeatmap();

		    }} // buffer of change listener
		}
	    },
	    {
		text: 'Reorder rows',
		checked: p2globalParams.heatmapViewer.defaultRowReordering,
		checkHandler: function(e, checked, eOpts) {
		    var heatV =  new heatmapViewer();
		    heatV.setRowReordering(checked);
		    heatV.drawHeatmap();
		}
	    }

	] // items
    });

toolbar.add({
          text: "",
        type: "button",
        tooltip: 'Download current view',
        glyph: 0xf0ed,
        handler: function(){
            var canvas = document.getElementById('heatmap-area');
            const maxSize = 2000;
            if (canvas.width > maxSize | canvas.height >maxSize){
                Ext.Msg.show({
                  title: 'Warning',
                  msg: 'The current canvas size exceeds ' + maxSize + 'px in at least one dimension.' +
                   'This may cause problems during exporting. Do you want to continue?',
                   buttons: Ext.Msg.OKCANCEL,
                   fn: function(s) {
                     if (s == 'ok') {
                        canvas.toBlob(function(data){pagHelpers.downloadURL(data, 'heatmap.png')})
                     } //if
                   } //fn
                }) // Ext.Msg.show
            } else {
                          canvas.toBlob(function(data){pagHelpers.downloadURL(data, 'heatmap.png')})
            }// if
        } // handler
});



toolbar.add({
  text: '',
  xtype: 'button',
  tooltip: 'Clear selection overlay',
  glyph: 0xf12d,
  handler: function() {
    var heatV = new heatmapViewer();
    heatV.clearSelectionOverlay();

  }

});

      // Add plot configuration menu button
    toolbar.add({
    	text: '',
    	xtype: 'button',
    	tooltip: 'Configure heatmap plot settings',
    	glyph: 0xf013,
    	menu: heatmapSettingsMenu
    });


      toolbar.add({
    text: '',
    xtype: 'button',
    tooltip: 'Help',
    glyph: 0xf128,
    handler: function() {
          Ext.create('Ext.window.Window', {
            height: 300,
            width: 400,
            title: 'Help: Main Heatmap',
            scrollable: true,
            bodyPadding: 10,
            html: '<h2>Main heatmap</h2>' +
              '<p>The heatmap displays expression values for the selected genes.' +
              ' Genes are shown as rows and cells as columns</p>'+
              '<p>Double click to color the embedding by the selected gene expression.' +
              'You can hover with your mouse to identify genes and see the correspondence '+
              ' of the underlying cell in other heatmaps.</p>' +
              '<p>You can download the current view using the <span style="font-family: FontAwesome">&#xf0ed</span> (download) icon. In some cases the downloaded file will not have the correct extension, please rename it to end in ".png" if that happens. You can clear highlighting of cells using the <span style="font-family: FontAwesome">&#xf12d</span> (clear) icon. Finally, you can use the <span style="font-family: FontAwesome">&#xf013</span> (settings) icon to adjust the view of the heatmap. Specifically you can adjust the color palette used for plotting and the number of colours available. Some palettes only support a limited range or a fixed number of colours and this may limit the number of values you can enter. The reorder rows option (default: on) enabled reordering of the gene rows. When the checkbox is selected the genes will appear in the order that they appear in the table used to select them. When the checkbox is selected the genes will be reordered on the fly. Reordering is performed by kmeans clustering of the rows.</p>',
            constrain: true,
            closable: true,
            resizable: false
          }).show();
    } // handler
  }); // toolbar add


    var heatmapPanel = Ext.getCmp('heatmapPanel');
    heatmapPanel.getHeader().add(toolbar);
}

/**
 * Setup all the overlay canvas events
 * @description sets up all the events on the overlay canvas
 * that used for things  like crosshairs, tooltip and gene row
 * clicking
 */
heatmapViewer.prototype.setupOverlays = function() {

    var heatmapAreaOverlay = $('#heatmap-area-overlay')[0];

    this.primaryMouseButtonDown = false;
    this.dragging = false;
    this.dragStartX = null;

    // For preventing selection on double click
    heatmapAreaOverlay.addEventListener('mousedown', function(e) {
      e.preventDefault();

      var heatView = new heatmapViewer();
      var drawConsts = heatView.getDrawConstants();
      if (e.offsetX > drawConsts.left &  e.offsetX < drawConsts.left + drawConsts.width) {
        heatView.primaryMouseButtonDown = true;
        heatView.dragStartX =  e.offsetX;
      }

    });

    heatmapAreaOverlay.addEventListener('mouseup', function(e) {
      var heatView = new heatmapViewer();
      heatView.primaryMouseButtonDown = false;

      if(heatView.dragging) {
        // End of drag
        heatView.dragging = false;

        // Range of X is heatView.dragStartX  to e.offsetX

        var drawConsts = heatView.getDrawConstants();

        var dendV = new dendrogramViewer();
        var curDisplayIdxs = dendV.getCurrentDisplayCellsIndexes();


        // Start and end as percent of current display cell range
        var startPC = (heatView.dragStartX - drawConsts.left) / drawConsts.width;
        var endPC = (e.offsetX - drawConsts.left) / drawConsts.width;


        // For left to right drag
        if (startPC > endPC) {
          var tmp = startPC;
          startPC = endPC;
          endPC = tmp;
        };

        // Avoid out of bounds issues
        if (endPC > 1) { endPC =1};
        if (startPC < 0) { startPC = 0};

        var ncells = curDisplayIdxs[1] - curDisplayIdxs[0];

        var startIndex = Math.floor(startPC * ncells);
        var endIndex = Math.floor(endPC * ncells);



        var cellsForSelection = dendV.getCurrentDisplayCells().slice(startIndex, endIndex);

	      var cellSelCntr = new cellSelectionController();
	      cellSelCntr.setSelection('heatmapSelection', cellsForSelection, 'Heatmap Selection', new Object());

            // Highlight on heatmap
            var heatV = new heatmapViewer();
            heatV.highlightCellSelectionByName('heatmapSelection');

            // Highlight on embedding
            var embCntr = new embeddingViewer();
            embCntr.highlightSelectionByName('heatmapSelection');

            // Highlight on Aspects
            var aspHeatView = new aspectHeatmapViewer();
            aspHeatView.highlightCellSelectionByName('heatmapSelection');

            //Highlight on Metadata
            var metaView = new metaDataHeatmapViewer();
            metaView.highlightCellSelectionByName('heatmapSelection');
      }


    });




    // Click listener for setting gene color to embedding
    heatmapAreaOverlay.addEventListener('dblclick', function(e) {
    	var x = e.offsetX;
    	var y = e.offsetY;

    	var heatView = new heatmapViewer();
    	var regionData = heatView.geneRegions.resolveClick(x, y);

    	// Draw tooltip
    	if (typeof regionData !== 'undefined') {
    	    // Tell the embedding to update
    	    var embV = new embeddingViewer();
    	    embV.setColorConfiguration('geneexpression');
    	    embV.setGeneExpressionColorInfo({geneid: regionData.geneId});
    	    embV.updateColors();
    	}
    });

    // Mouse  move listener for the cross hairs and tooltip
    heatmapAreaOverlay.addEventListener('mousemove', function(e) {
    	var x = e.offsetX;
    	var y = e.offsetY;

    	var heatV = new heatmapViewer();
    	var metaV = new metaDataHeatmapViewer();
    	var aspeV = new aspectHeatmapViewer();

    	var label;

    	var regionData = heatV.geneRegions.resolveClick(x, y);
    	if  (typeof regionData !== 'undefined') {
    	    label = 'Gene: ' + regionData.geneId;
    	}

    	heatV.showOverlay(e.offsetX, e.offsetY, label);
    	metaV.showOverlay(e.offsetX);
    	aspeV.showOverlay(e.offsetX);

      if(heatV.primaryMouseButtonDown) {
        if (!heatV.dragging) {
          // The first mouse move after the mouse down
          // Initiate dragging process
          heatV.clearSelectionOverlay(); // This is for resetting the current selection params not for the actual clear
          heatV.dragging = true;
        }

        // Clear the canvas
        var canvas = document.getElementById('heatmap-area-selection');
        var ctx = canvas.getContext('2d');
        var width = canvas.width;
        var height = canvas.height;
        ctx.clearRect(0,0,width, height);


        var drawConsts = heatV.getDrawConstants();
        var actualPlotHeight = heatV.getActualPlotHeight();

        var boundedX;
        if (x < drawConsts.left) {
          boundedX = drawConsts.left;
        } else if (x > drawConsts.left + drawConsts.width) {
          boundedX = drawConsts.left + drawConsts.width;
        } else {
          boundedX = x;
        }


        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,0,0,0.5)';
        ctx.fillRect(heatV.dragStartX, drawConsts.top, boundedX - heatV.dragStartX, actualPlotHeight);
        ctx.restore();



      }

    });

    // Remove the cursor when done
    heatmapAreaOverlay.addEventListener('mouseout', function(e) {
    	var metaV = new metaDataHeatmapViewer();
    	var heatV = new heatmapViewer();

    	heatV.clearOverlay();
    	metaV.clearOverlay();
    });

    // Pointer change to cross hairs when over the heatmap
    heatmapAreaOverlay.addEventListener('mouseenter', function(e) {
    	document.body.style.cursor = "crosshair";
    });

    heatmapAreaOverlay.addEventListener('mouseout', function(e) {
    	document.body.style.cursor = "default";
    });
}

/**
 * Get the order in which the rows of the provided data
 * are best ordered in for visual purposes
 * @param data a dgCMatrix reader with the sparse array data
 */
heatmapViewer.prototype.getRowVisualOrder = function(data) {
//    the bin size


    var ncols = data.Dim[0];
    var nrows = data.Dim[1];


    var binsize = Math.max(ncols / 30);
    var ncolsbin = Math.ceil(ncols / binsize);

    // Make empty bins array
    var binsSumArray = new Array(nrows);
    for (var k = 0; k < nrows; k++) {
    	var row = new Array(ncolsbin);
    	for (var j = 0; j < ncolsbin; j++) {
    	    row[j] = 0;
    	}
    	binsSumArray[k] = row;
    }

    // Sum values for every bin
    for (var j = 0; j < data.p.length - 1; j++) {
    	// Row start and end index
    	var rsi = data.p[j];
    	var rei = data.p[j+1] - 1;

    	for (var k = rsi; k < rei; k++) {
    	    var cn = data.i[k];

    	    // Find the bin index for this element
    	    var binindex = Math.floor(cn / binsize);
    	    binsSumArray[j][binindex] = binsSumArray[j][binindex] + data.x[k];
    	}
    }

    function meanClampNorm(v, rowMean, maxAbsValue) {
    	const trim = 0.3;
    	maxAbsValue *= trim;

    	const range = 1;

    	var val =  (v - rowMean) / (maxAbsValue * 2) + 0.5;
    	val = val * range;
    	val = val < 0 ? 0 : val;
    	val = val > range ? range : val;
    	return val;
    }

    // Normalise
    for (var j = 0; j < binsSumArray.length; j++) {

    	var maxAbsValue = 0;

    	var rowMean = 0;
    	var row = binsSumArray[j];
    	for (var i = 0; i < row.length; i++) {
    	    rowMean += row[i];
    	    maxAbsValue =  Math.abs(row[i]) > maxAbsValue ? Math.abs(row[i]) : maxAbsValue;
    	}
    	rowMean /= row.length;

    	for (var i =0; i< row.length; i++) {
    	    row[i] = meanClampNorm(row[i], rowMean, maxAbsValue);
    	}

    	// This is probably not requried
    }

    var d = binsSumArray;

    for (var j = 0; j < d.length; j++) {
	var maxAbsValue = 0;
	var rowMean = 0;
	for (var i = 0; i < d[j].length; i++) {
	    rowMean += d[j][i];
	    maxAbsValue = Math.abs(d[j][i]) > maxAbsValue ? Math.abs(d[j][i]) : maxAbsValue;
	}
	rowMean /= d[j].length;
	for (var  i =0; i < d[j].length; i++) {
	    d[j][i] = meanClampNorm(d[j][i], rowMean, maxAbsValue);
	}
    }

    // Do hierarchical clustering
    var hc = hcluster(d, pagHelpers.seq(0, d.length - 1), 'corrdist', 'average')
    // Do a depth first search on the tree
    function getOrder(hc) {
	var order = [];
	if (hc.hasOwnProperty('left')) {
	    order = order.concat(getOrder(hc.left));
	    order = order.concat(getOrder(hc.right));
	} else {
	    order.push(hc.label);
	}
	return order;
    }
    var order = getOrder(hc);

    // Change into the required format
    var order2 = [];
    for (var i = 0; i < order.length; i++) {
	order2[order[i]] = i;
    }


    // Return the order from the depth first
    return order2;

}

/**
 * Clear the overlay
 */
heatmapViewer.prototype.clearOverlay = function() {
  var overlayArea = document.getElementById('heatmap-area-overlay');
	var ctx = overlayArea.getContext('2d');

	var width = overlayArea.width;
	var height = overlayArea.height;

	ctx.clearRect(0,0,width, height);
}

heatmapViewer.prototype.clearSelectionOverlay = function() {
  this.clearSelectionOverlayInternal();
  this.currentOverlaySelectionShown = false;
}

heatmapViewer.prototype.clearSelectionOverlayInternal = function() {
  var canvas = document.getElementById('heatmap-area-selection');
  var ctx = canvas.getContext('2d');
  var width = canvas.width;
  var height = canvas.height;
  ctx.clearRect(0,0,width, height);
}



/**
 * Show the overlay crosshairs and tooltip
 */
heatmapViewer.prototype.showOverlay = function (x,y, label) {

    // Avoid jquery lookup for performance here
    var overlayArea = document.getElementById('heatmap-area-overlay');
    var ctx = overlayArea.getContext('2d');

    var heatView = new heatmapViewer();

    var drawConsts = heatView.getDrawConstants();

    var areaWidth = overlayArea.width;
    var areaHeight = overlayArea.height;

    ctx.setLineDash([10,10])
    ctx.lineWidth = 1;
    ctx.clearRect(0,0,areaWidth,areaHeight);

    var actualPlotHeight = heatView.getActualPlotHeight();

    if (typeof y !== 'undefined' & y < actualPlotHeight
       ){
	ctx.beginPath();
	ctx.moveTo(drawConsts.left, y);
	ctx.lineTo(drawConsts.width + drawConsts.left, y);
	ctx.stroke();
    }

    if (typeof x !== 'undefined' &
	x > drawConsts.left &
	x < drawConsts.width + drawConsts.left  &
	(y < actualPlotHeight  | typeof y === 'undefined') // if y is provided it is in the plot
       ) {

	ctx.beginPath();
	ctx.moveTo(x, drawConsts.top);
	ctx.lineTo(x, actualPlotHeight + drawConsts.top);
	ctx.stroke();
    }

    // The tooltip
    if (typeof y !== 'undefined' & typeof x !== 'undefined' & typeof label !== 'undefined') {

	ctx.save();
	const tooltipTop = 30;
	const tooltipLeft = 30;

	const tooltipWidthPadding = 20;
	const tooltipHeight = 30;

	const tooltipShadowOffset = 3;

	ctx.font = '18px Arial';
	var textSize = ctx.measureText(label);

	// Tooltip text
	ctx.fillStyle = 'black';
	ctx.fillText(label, x + tooltipLeft , y + tooltipTop);
	ctx.restore();
    }
}

heatmapViewer.prototype.getHeight = function() {
  return Ext.getCmp('heatmapPanel').getHeight() - 60;
}

heatmapViewer.prototype.getWidth = function() {
  return (Ext.getCmp('heatmapPanel').getWidth() );
}

/**
 * Update the canvas size given the size from heatmapDendrogram
 */
heatmapViewer.prototype.updateCanvasSize = function() {
    var heatmapArea = $('#heatmap-area')[0];
    var heatmapAreaOverlay = $('#heatmap-area-overlay')[0];

    var curWidth =  this.getWidth();
    var curHeight =  this.getHeight();

    this.canvasElementWidth = curWidth;
    this.canvasElementHeight =  curHeight;

    // Update the size of  the  main area
    heatmapArea.width = curWidth;
    heatmapArea.height = curHeight;

    // Update the  size of the overlay
    heatmapAreaOverlay.width = curWidth;
    heatmapAreaOverlay.height = curHeight;

    // Resize the selection canvas
    var heatmapAreaSelection = $('#heatmap-area-selection')[0];
    heatmapAreaSelection.width = curWidth;
    heatmapAreaSelection.height = curHeight;

}

/**
 * Sets a gene selection from the gene selection controller as the
 * display genelist
 * @param selectionName Name of the selection from the gene selection controller
 */
heatmapViewer.prototype.setNamedSelectionToDisplayGenes = function(selectionName) {
    var geneSelCntr =  new geneSelectionController();
    this.displayGenes = geneSelCntr.getSelection(selectionName).genes;
}


/**
 * Return the font size to use to print the heatmap row names
 */
heatmapViewer.prototype.getRowFontSize = function (cellHeight) {
    var a = Math.min(cellHeight, 20);
    a = a * 3/4;
    if (a < 8) { a = 0;}

    return a;
}

/**
 * set the row reordering
 */
heatmapViewer.prototype.setRowReordering = function(v) {
    this.rowReordering = v;
}


/**
 * get the row reordeing
 */
heatmapViewer.prototype.getRowReordering = function(v) {
    return this.rowReordering;
}


/**
 * Clears the heatmap drawing area
 */
heatmapViewer.prototype.clearHeatmap = function(ctx) {
	// Clear the canvas
	// FIXME: Clear the correct area
	ctx.clearRect(0,0,3000,3000);
}

/**
 * Draws the heatmap
 */
heatmapViewer.prototype.drawHeatmap = function() {
    if (typeof this.displayGenes === 'undefined' || this.displayGenes.length === 0) {
	// No gene selected

	var ctx = this.getDrawingContext();
	this.clearHeatmap(ctx);


	var heatDendView = new heatmapDendrogramViewer();

	var left = heatDendView.getPlotAreaLeftPadding();
	var heatmapWidth = this.getWidth() - heatDendView.getPlotAreaRightPadding();
	var heatmapHeight = this.getHeight();

	const text = 'No Genes selected';

	ctx.font = '20px Arial';

	// Center justify the lest
	var measure = ctx.measureText(text);
	left = left - measure.width /2;
	ctx.fillText(text, heatmapWidth /2 + left, heatmapHeight/2);


	// We also want to maintain a gene selection showing the
	// current plotted genes
	var geneSelCntr = new geneSelectionController();
	geneSelCntr.setSelection('heatmapDisplayGenes', [], 'Current Heatmap Genes');
    } else {

	// Make a gene selection with the currently shown genes
	var geneSelCntr = new geneSelectionController();
	geneSelCntr.setSelection('heatmapDisplayGenes', this.displayGenes, 'Current Heatmap Genes');
	this.doDrawHeatmap();
    }
}

/**
 * Get 2d drawing context for the main heatmap canvas
 * @private
 */
heatmapViewer.prototype.getDrawingContext = function() {
    // Get the plotting context
    var canvas = document.getElementById('heatmap-area');
    var ctx = canvas.getContext("2d");

    return ctx;
}

/**
 * Get 2d drawing context for the mouse overlay canvas
 * @private
 */
heatmapViewer.prototype.getOverlayDrawingContext = function() {
  var canvas = document.getElementById('heatmap-area-overlay');
  var ctx = canvs.getContext('2d');
  return ctx;
}

/**
 * Get 2d drawing context for the selection canvas
 * @private
 */
heatmapViewer.prototype.getSelectionDrawingContext = function() {
  var canvas = document.getElementById('heatmap-area-selection');
  var ctx = canvas.getContext('2d');
  return ctx;
}


/**
 * Get drawing constant values
 */
heatmapViewer.prototype.getDrawConstants = function() {
    var heatDendView = new heatmapDendrogramViewer();

    // TODO: values here should be in global params
    return {
    	top: 5,
    	left:  heatDendView.getPlotAreaLeftPadding(),
    	width: this.getWidth() - heatDendView.getPlotAreaRightPadding(),
    	height: this.getHeight() ,
    	paddingBottom: 10,
    	maxCellHeight: 30,
    }
}

/**
 * Set the plot height that was actually used
 */
heatmapViewer.prototype.setActualPlotHeight = function(val) {
    this.actualPlotHeight = val;
}

/**
 * Get the plot height that was actually used
 */
heatmapViewer.prototype.getActualPlotHeight = function() {
    return this.actualPlotHeight + this.getDrawConstants().top;
}


/**
 * Plot the heatmap internally using the appropriate function
 * @private
 */
heatmapViewer.prototype.doDrawHeatmap = function() {
    // TODO: Left over, remove

    this.doDrawHeatmapSparseMatrix();
}



/**
 * Given a cell selection name hightlight it on the heatmap with vertical lines
 */
heatmapViewer.prototype.highlightCellSelectionByName = function(selectionName) {
  var heatV = this;

  this.currentOverlaySelectionName = selectionName;
  this.currentOverlaySelectionShown = true;


  var dendV = new dendrogramViewer();

  // Get the cells in the cell selection to highlight
  var cellSelCntr = new cellSelectionController();
  var cellSelection = cellSelCntr.getSelection(selectionName);

  // Get the cell order
  var dataCntr = new dataController();
  dataCntr.getCellOrder(function(cellorder) {
    // Currently displayed cells
    var cellRange = dendV.getCurrentDisplayCellsIndexes();
    var ncells = cellRange[1] - cellRange[0];

    var ctx = heatV.getSelectionDrawingContext();
    ctx.clearRect(0,0,3000,3000);

    // Get and calculate plotting values
    var drawConsts = heatV.getDrawConstants();
    var heatmapWidth = drawConsts.width;
    var cellWidth = heatmapWidth / ncells;
    var left = drawConsts.left;
    var n = cellSelection.length;

    var actualPlotHeight = heatV.getActualPlotHeight();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,0.3)';

    // Draw vertical lines for selected cells
    for (var i = 0; i < n; i++) {
      var cellIndex = cellorder.indexOf(cellSelection[i]);

      // Cell is among currently displayed ones
      if (cellIndex < cellRange[1] && cellIndex > cellRange[0]) {
        var colIndex = cellIndex - cellRange[0];

        var x = colIndex * cellWidth + left;

        ctx.beginPath();
        ctx.moveTo(x, drawConsts.top);
        ctx.lineTo(x, actualPlotHeight);
        ctx.stroke();
      } // if
    } // for

    ctx.restore();

  }); // get the cell order
}

heatmapViewer.prototype.setMissingDisplay = function(value) {
  this.missingDisplay = value;

}

/**
 * Internal function for drawing the heatmap using the sparse matrix directly
 * @description assumes that the displayGenes in is not empty
 * @private
 */
heatmapViewer.prototype.doDrawHeatmapSparseMatrix = function() {

    var dendV = new dendrogramViewer();
    var heatDendView = new heatmapDendrogramViewer();


// heatDendView.getCurrentHeatmapHeight()

    // Get the drawing params
    var drawConsts = this.getDrawConstants();
    var top = drawConsts.top;
    var left = drawConsts.left;
    var heatmapWidth = drawConsts.width;
    var heatmapHeight = drawConsts.height - drawConsts.paddingBottom;

    // Get the genes to plot
    var geneSelection = this.displayGenes;

    // Get the cells to plot
    var cellRange = dendV.getCurrentDisplayCellsIndexes();
    var cellIndexStart = cellRange[0];
    var cellIndexEnd = cellRange[1];

    var heatView = this;

    // Clear heatmap
    var ctx = heatView.getDrawingContext();
    heatView.clearHeatmap(ctx);

    // Clear selection heatmap
   // heatView.clearSelectionOverlayInternal();

    // Show centered waiting icon
    $('#heatmap-area-container').append("<img class='loadingIcon' src='img/loading.gif'/>");
    var loadingDomItem =  $('#heatmap-area-container > .loadingIcon')
    var lpad = this.getWidth()  / 2;
    var tpad = this.getHeight() /2;
    loadingDomItem.css({'padding-left': lpad + 'px', 'padding-top': tpad + 'px'});

    var dataCntr = new dataController();
    dataCntr.getExpressionValuesSparseByCellIndexUnpacked(geneSelection, cellIndexStart, cellIndexEnd, false, function(data) {
        loadingDomItem.remove();

	// Get the dimensions
	var ngenes = data.Dim[1];
	var ncells = data.Dim[0];

	// Computed plotting params
	var cellWidth = heatmapWidth / ncells;
	var cellHeight = heatmapHeight / ngenes;

	// Limit max cell height
	drawConsts = heatView.getDrawConstants(); // Do we need this again
	cellHeight = Math.min(cellHeight, drawConsts.maxCellHeight);

	// Calculate Height after taking max cell size to account
	var actualPlotHeight = ngenes * cellHeight;

	// Have to set it on the obj for the crosshairs
	heatView.setActualPlotHeight( actualPlotHeight );

	// Get a new row order
	var rowOrder;
	if (heatView.getRowReordering() === true) {
            rowOrder = heatView.getRowVisualOrder(data);
	} else {
	    rowOrder = pagHelpers.seq(0,data.Dim[1] -1);
	}

	// Get palette
	var palSize = heatView.palManager.getNumberOfColors();
	var pal = heatView.palManager.getPaletteColors();

	// Plot background according the missing value setting
	if (heatView.missingDisplay == 'mean') {
	  ctx.fillStyle = pal[Math.floor(palSize/2)];
	} else if (heatView.missingDisplay == 'white') {
	  ctx.fillStyle = 'white';
	} else if (heatView.missingDisplay == 'black') {
	  ctx.fillStyle = 'black';
	} else if (heatView.missingDisplay == 'grey') {
	  ctx.fillStyle = '#666666';
	} else if (heatView.missingDisplay == 'min') {
	  ctx.fillStyle = pal[0];
	}
	ctx.fillRect(left,top,heatmapWidth,actualPlotHeight);

	for ( var j = 0; j < data.p.length - 1; j++) {
	    // row start index, row end index (in x and i)
	    var rsi = data.p[j];
	    var rei = data.p[j+1] -1;

	    // Calculate row normalisation values
	    var rowMin = data.x.slice(rsi, rei).reduce(function(a,b){ return Math.min(a,b) } );
	    var rowMax = data.x.slice(rsi, rei).reduce(function(a,b){ return Math.max(a,b) } );
	    var rowSum = data.x.slice(rsi, rei).reduce(function(a,b){ return a+b });
	    var rowMean = rowSum / (rei - rsi + 1);
	    var maxAbsValue = Math.max(Math.abs(rowMin - rowMean), Math.abs(rowMax - rowMean));

	    // color mapper is a function
	    // use a color mapper to ensure consistency of coloring with
	    // other views (eg embedding)
	    var colorMapper = heatView.palManager.getMeanClampedColorMapper(rowMean, maxAbsValue, palSize);

	    // Plot row
	    for (var k = rsi; k < rei; k++) {
      //		var plotValue = (data.x[k] - rowMean) / (maxAbsValue * 2) + 0.5;
      //		var palIndex = Math.floor(plotValue * (palSize)) - 1;

      		var palIndex = colorMapper(data.x[k]);
      		ctx.fillStyle = pal[palIndex];

      		var x = data.i[k] * cellWidth + left;
      		var y = rowOrder[j] * cellHeight + top; // reorder on the fly

      		ctx.fillRect(x,y,
  		    cellWidth, cellHeight);
	    } // for k

	} // for j

	// Draw bounding box
	ctx.strokeRect(left, top, heatmapWidth, actualPlotHeight);

	// Plot the labels
	for (var i = 0; i < data.DimNames2.length; i++) {
	    // Print the names
	    var name = data.DimNames2[i];

	    // Get the appropriate font size for this number of cells
	    var fontSize =  heatView.getRowFontSize(cellHeight)

	    // Calculate position
	    x = ncells * cellWidth + left + 20;
	    y = rowOrder[i] * cellHeight + top + cellHeight / 2 + fontSize / 3;

	    // Plot
	    ctx.font =  fontSize + 'px Arial';
	    ctx.fillStyle = 'black';
	    ctx.fillText(name, x, y);
	} // Label plot loop


	// Setup the resolvable regions (to gene names)
	// these are used for tooltips and coloring by gene
	heatView.geneRegions.clearClickAreas();
	for (var i = 0; i < data.DimNames2.length; i++) {
	    j = rowOrder[i];

	    var x1 = left;
	    var y1 = cellHeight * j + top;
	    var x2 = heatmapWidth;
	    var y2 = cellHeight * ( j +1 ) + top;

	    heatView.geneRegions.addClickArea(
		x1, y1,
		x1, y2,
		x2, y2,
		x2, y1,
		{geneId: data.DimNames2[i] }
	    );
	} // for

    heatView.clearSelectionOverlayInternal();
    if (heatView.currentOverlaySelectionShown === true) {
      heatView.highlightCellSelectionByName(heatView.currentOverlaySelectionName);
    }

    }); // dataCntr.getExpressionValuesSparseTransposedByCellIndexUnpacked callback
} // doDrawHeatmapSparseMatrix


