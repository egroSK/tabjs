var ColumnType = require('./columntype');

module.exports = Column;

function Column(dbName, viewName, dataType) {
	this.dbName = dbName;
	this.viewName = viewName;
	this.dataType = (typeof dataType === 'undefined') ? ColumnType.STRING : dataType; //!check if type is from ColumnType
	this.sortable = false;
	this.filterable = false;
	this.filterOptions = [];
	this.linkToId = null;
}

Column.prototype.setSortable = function(bool) {
	if (bool === true || typeof bool === 'undefined') {
		this.sortable = true;
	}
	return this;
}

Column.prototype.setFilterable = function(filterOptions) {
	this.filterable = true;

	switch (this.dataType) {
		case ColumnType.BOOLEAN:
			this.filterOptions = [
				['', ''],
				[1, 'true'],
				[0, 'false']
			];
			break;
		case ColumnType.SELECT:
			if (filterOptions) { //need more checks
				this.filterOptions = filterOptions;
				this.filterOptions.push(['', '']);
				this.filterOptions.sort();
			}
			break;
	}
	return this;
}

Column.prototype.setLinkToId = function(ncv) {
	this.linkToId = {
		ncv: ncv
	};
	return this;
}