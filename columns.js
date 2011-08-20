var Column = require('./column');

module.exports = Columns;

function Columns() {
	this.cols = [];
}

Columns.prototype.newColumn = function(dbName, viewName, dataType) {
	var column = new Column(dbName, viewName, dataType);
	this.cols.push(column);
	return column;
}

//async?
Columns.prototype.getColumn = function(columnName) {
	if (!columnName) {return null};
	
	var i = this.cols.length;
	while (i--) {
		if (this.cols[i].dbName === columnName) {
			return this.cols[i];
		}
	}
	return null;
}

Columns.prototype.isSortable = function(testColumn) {
	var col = this.getColumn(testColumn);
	if (col) {
		return col.sortable; 
	} else {
		return false;
	}
}

Columns.prototype.getColumns = function() {
	return this.cols;
}

Columns.prototype.countVisibleColumns = function () {
	var count = 0;
	var i = this.cols.length;
	while (i--) {
		if (this.cols[i].hidden === false) {
			count++;
		}
	}
	return count;
}