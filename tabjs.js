var	Path = require('path'),
		Querystring = require('querystring'),
		Template = require('flowon/src/modules/template.js').Template,
		Columns = require('./columns'),
		ColumnType = require('./columntype');
	
var displayedItems = [5, 10, 25, 50, 100, 200],
		defaultItemsPerPage = 25;

module.exports = Tabjs;

/// Constructor

function Tabjs(dataSource, params, controller) {
	this.dataSource = dataSource;
	this.params = params;
	this.controller = controller;
	this.cols = new Columns();	
	this.rowCondAttrs = [];
	this.actions = {};
	this.actions['batch'] = null;
	this.actions['row'] = null;
	this.implicitSelector = {};
	this.defaultSort = null;
	this.filterForm = controller.getForm('filter');
	this.actionForm = controller.getForm('action');

	/// Filter
	// spracuje hodnoty formularu do 'premennej' filter a redirectne s tymto parametrom
	if (this.filterForm.submitted) {
		this.params.filter = formValuesToQuery(this.filterForm);
		
		var route = this.controller._route;
		var redirectLink = [route.namespace, route.controller, route.view].join(':');
		this.controller.redirect(redirectLink, this.params);
	}
	
	// rozparsuje filtre do objektu
	this.filterObj = (this.params.filter) ? Querystring.parse(this.params.filter) : null;
}

/// Functions

function formValuesToQuery(filterForm) {
	var values = filterForm.values,
			outValues = {};

	for (prop in values) {
		if (values[prop] !== '' && prop !== '_form') {
			outValues[prop] = values[prop];
		}
	}
	
	return Querystring.stringify(outValues);
}

function loadParams() {
	var params = this.params;
	var outParams = {};
	
	// sortable
	if (this.cols.isSortable(params.sortColumn)) {
		outParams.sortColumn = params.sortColumn;
		if (params.sortType === 'desc') {
			outParams.sortType = 'desc';
		} else {
			outParams.sortType = 'asc';
		}
	}
	
	// filterable
	if (this.filterObj) {
		outParams.filter = [];
		
		for (prop in this.filterObj) {
			if (this.filterObj[prop].length > 0) {

				var col = this.cols.getColumn(prop);
				if (col && col.filterable) {
					outParams.filter.push({
						'filterColumn': col,
						'filterValue': this.filterObj[prop]
					});
				} //if
				
			} //if
		} //for
	} //if
	
	// itemsPerPage
	numItemsPerPage = parseInt(params.itemsPerPage, 10);
	if (numItemsPerPage && (displayedItems.indexOf(numItemsPerPage) !== -1)) {
		outParams.itemsPerPage = numItemsPerPage;
	}	else {
		outParams.itemsPerPage = defaultItemsPerPage; 
	}
		
	// page
	numPage = parseInt(params.page, 10);
	outParams.page = (numPage && (numPage > 0)) ? numPage : 1;
	
	return outParams;
}

function toTimestamp(strDate){
 return Date.parse(strDate)/1000;
}

/**
 * @this {Tabjs}
 * @param {string} actionType
 * @param {string} actionName
 * @param {Array.<ObjectId>} ids
 * @param {?string} extraValue
 */
function doAction(actionType, actionName, ids, extraValue) {
	var that = this;
	var count = ids.length;

	var reload = function () {
		var route = that.controller._route;
		var redirectLink = [route.namespace, route.controller, route.view].join(':');
		delete that.params.actionName;
		delete that.params.actionId;
		that.controller.redirect(redirectLink, that.params);
	};

	if (this.actions[actionType][actionName]) {
		ids.forEach(function (id) {
			that.actions[actionType][actionName](id, function(err) {
				if (err) {
					that.controller.flash('Action ' + actionName + ' for ObjectId: "' + id + '" was finished with error (' + err + ').', 'error');
				} else {
					that.controller.flash('Action ' + actionName + ' for ObjectId: "' + id + '" successfully completed.');
				}
				if (--count === 0) {
					reload();
				}
			}, extraValue);
		});

		if (count === 0) {
			reload();
		}
	} else {
		this.controller.flash('Action "' + actionName + '" doesn\'t exists.', 'error');
		reload();
	}
}

function sendActionForm() {
	var values = this.actionForm.values;
	var actionName = values['action'];
	var extraValue = values['extra_value'];
	
	delete values['action'];
	delete values['extra_value'];
	delete values['_form'];
	
	doAction.call(this, 'batch', actionName, Object.keys(values), extraValue);	
}

/// Template objects

// Create array with members for paginator
function getPaginator(page, pageCount) {
	var rangeFrom = Math.max(1, page - 2),
			rangeTo = Math.min(pageCount, page + 2),
			arr = [];

	if (rangeFrom > 1) {arr.push(1);}
	if (rangeFrom > 2) {arr.push('...');}
	for (var i = rangeFrom; i <= rangeTo; i++) {arr.push(i);}
	if (rangeTo < pageCount - 1) {arr.push('...');}
	if (rangeTo < pageCount) {arr.push(pageCount);}
	
	return arr;
}

// Get string value of attributes for row
function getCondAttrsForRow(row) {
	var attrObj = {};
	var attrStr = '';
	
	this.rowCondAttrs.forEach(function (cond) {
		if (row[cond.dbName] === cond.expValue) {
			for (prop in cond.attrs) {
				if (attrObj[prop]) {
					attrObj[prop].push(cond.attrs[prop]);
				} else {
					attrObj[prop] = [cond.attrs[prop]];
				}
			}	
		}
	});
	
	for (prop in attrObj) {
		attrStr += prop + '="' + attrObj[prop].join(' ') + '"';
	}
	
	return attrStr;
}

/// Methods

Tabjs.prototype.addColumn = function(dbName, viewName, dataType) {
	return this.cols.newColumn(dbName, viewName, dataType);
};

Tabjs.prototype.addRowConditionalAttr = function (colDbName, expectedValue, attrs) {
	attrs = attrs || {};
	this.rowCondAttrs.push({'dbName': colDbName, 'expValue': expectedValue, 'attrs': attrs});
}

/**
 * @param {string} name Name of action
 * @param {function(ObjectId, function)} fn Function with action, first param is ID and second param is callback.
 * @param {?Array.<string>} type The type of action can be "batch" or/and "row", if nothing is provided, "batch" is default.
 */
Tabjs.prototype.addAction = function (name, fn, type) {
	if (!name || name.length < 1) {
		this.controller.terminate(500, 'Tabjs.addAction: missing name');
	}
	if (typeof fn !== 'function') {
		this.controller.terminate(500, "Tabjs.addAction: second parameter isn't function");
	}

	var batch_action = false;
	var row_action = false;
	if ((type) && (type.indexOf('batch') > -1)) {
		batch_action = true;
	}
	if ((type) && (type.indexOf('row') > -1)) {
		row_action = true;
	}
	if ((!batch_action) && (!row_action)) {
		batch_action = true;
	}

	var addAction = function (action_type) {
		if (!this.actions[action_type]) {
			this.actions[action_type] = {};
		}
		if (this.actions[action_type][name]) {
			this.controller.terminate(500, 'Tabjs.addAction: "' + action_type + '" action with name "' + name + '" already exists');
		}
		this.actions[action_type][name] = fn;	
	}.bind(this);

	if (batch_action) {
		addAction('batch');
	}

	if (row_action) {
		addAction('row');
	}
}

/**
 * @param {Object.<string, number|boolean|string}>} selector
 */
Tabjs.prototype.setImplicitSelector = function (selector) {
	if ((selector.constructor !== Object)) {
		this.controller.terminate(500, 'Tabjs.setDefaultSelector: selector must be an Object');	
	}
	this.implicitSelector = selector;
}

/**
 * @param {string} column Column name, column must be added by addColumn first and must be sortable.
 * @param {string} type Type must be ASC or DESC, default is ASC.
 */
Tabjs.prototype.setDefaultSorting = function (column_name, sort_type) {
	if (!this.cols.isSortable(column_name)) {
		this.controller.terminate(500, 'Tabjs.setDefaultSorting: column must be added by addColumn and must be sortable');
	}
	if (sort_type.toLowerCase() === 'desc') {
		this.defaultSort = [column_name, 'desc'];
	} else {
		this.defaultSort = [column_name, 'asc'];
	}
}

Tabjs.prototype.render = function(callback) {
	if ((this.actionForm.submitted) || ((this.params.actionName) && (this.params.actionId))) {
		if (this.actionForm.submitted) {
			return sendActionForm.call(this);
		}
		if ((this.params.actionName) && (this.params.actionId)) {
			return doAction.call(this, 'row', this.params.actionName, [this.params.actionId]);
		}
	} else {
		var that = this;

		// Create template for component
		var template = new Template(this.controller);
		template.setPath(Path.join(__dirname, 'templates', 'tab.html.ejs'));
	
		// Params cleaning
		var params = loadParams.call(this);
	
		// Options
		var options = {};
		if ((!params.sortColumn) && (this.defaultSort)) {
			options.sort = [this.defaultSort];
		}
		if (params.sortColumn) {
			options.sort = [[params.sortColumn, params.sortType]]
		}

		// Selectors (+fill form)
		var selectors = {};
		if (params.filter) {
			for(var i = 0; i < params.filter.length; i++) {
				var currFilter = params.filter[i],
						currDbName = params.filter[i].filterColumn.dbName;
						currFilValue = params.filter[i].filterValue;
					
				// Fill form input with value
				this.filterForm.values[currDbName] = currFilValue;

				// Selectors for mongodb
				switch (currFilter.filterColumn.dataType) {
					case ColumnType.NUMBER:
						selectors[currDbName] = new Number(currFilValue);
						break;
					case ColumnType.BOOLEAN:
						if (currFilValue == 1 || currFilValue === true || currFilValue === 'true') {
							selectors[currDbName]	= true;
						} else {
							selectors[currDbName]	= false;
						}
						break;
					case ColumnType.TIMESTAMP:
						var dates = currFilValue.split(',');
						var dateFrom = toTimestamp(dates[0]);
						var dateTo = toTimestamp(dates[1]);
						selectors[currDbName] = {'$gte': dateFrom, '$lte': dateTo};
					 	break;
					default:
						selectors[currDbName] = new RegExp(currFilValue, 'i');
				}
			}
		}
	

		// Apply implicit selectors (override filter options)
		Object.keys(this.implicitSelector).forEach(function (key) {
			selectors[key] = this.implicitSelector[key];
		}.bind(this));
		this.dataSource.count(selectors, function(count) {
			var pageCount = Math.ceil(count/params.itemsPerPage);
			if (pageCount === 0) {pageCount = 1};
		
			if (params.page > pageCount) {
				params.page = pageCount;
			}
		
			// Options for skip/limit
			options.limit = params.itemsPerPage;
			options.skip = (params.page - 1) * params.itemsPerPage;
		
			// Get data + render
			that.dataSource.all(selectors, options, function(data) {		
				// Template params
				template.ColumnType = ColumnType;
				template.cols = that.cols.getColumns();
				template.data = data;
				template.getCondAttrsForRow = getCondAttrsForRow.bind(that);
				template.visibleColsCount = that.cols.countVisibleColumns();
			
				if ((!params.sortColumn) && (that.defaultSort)) {
					template.currSortColumn = that.defaultSort[0];
					template.currSortType = that.defaultSort[1];
				} else {
					template.currSortColumn = params.sortColumn;
					template.currSortType = params.sortType;
				}

				template.displayedItems = displayedItems;
				template.currItemsPerPage = params.itemsPerPage;
			
				template.paginatorArr = getPaginator(params.page, pageCount);
				template.currPage = params.page;
				template.pageCount = pageCount;
				
				template.actions = that.actions;

				// this.params is used in link_to_self (need revision)
				template.params = params;
				if (!params.filter) {
					delete template.params.filter;
				} else {
					template.params.filter = that.params.filter;
				}
				if (params.itemsPerPage == defaultItemsPerPage) {
					delete template.params.itemsPerPage;
				}
				if (params.page === 1) {
					delete template.params.page;
				}

				// Render
				template.render(function (err, html) {
					if (err) {
						callback(err);
					} else {
						callback(null, html);
					}
				});	
			});
		});
	}
}
