var	Path = require('path'),
		Querystring = require('querystring'),
		Template = require('flowon/src/modules/template.js').Template,
		Columns = require('./columns'),
		ColumnType = require('./columntype');
	
var displayedItems = [5, 10, 25, 50, 100, 200],
		defaultItemsPerPage = 25;

module.exports = Tabjs;

// Constructor

function Tabjs(dataSource, params, controller) {
	this.dataSource = dataSource;
	this.params = params;
	this.controller = controller;
	this.cols = new Columns();	
	this.filterForm = controller.getForm('filter');
	
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

// Functions

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

// Create array with members for paginator
function paginator(page, pageCount) {
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

// Methods

Tabjs.prototype.addColumn = function(dbName, viewName, dataType) {
	return this.cols.newColumn(dbName, viewName, dataType);
};

Tabjs.prototype.render = function(callback) {
	var that = this;

	// Create template for component
	var template = new Template(this.controller);
	template.setPath(Path.join(__dirname, 'templates', 'tab.html.ejs'));
	
	// Params cleaning
	var params = loadParams.call(this);
	
	// Options
	var options = {};
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
			
			template.currSortColumn = params.sortColumn;
			template.currSortType = params.sortType;
			
			template.displayedItems = displayedItems;
			template.currItemsPerPage = params.itemsPerPage;
			
			template.paginatorArr = paginator(params.page, pageCount);
			template.currPage = params.page;
			template.pageCount = pageCount;

			// this.params is using in link_to_self (need revision)
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