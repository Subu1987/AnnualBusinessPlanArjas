sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/viz/ui5/controls/VizFrame",
	"sap/viz/ui5/data/FlattenedDataset",
	"sap/viz/ui5/controls/common/feeds/FeedItem",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast",
	"sap/ui/core/BusyIndicator",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/VBox"
], function(Controller, VizFrame, FlattenedDataset, FeedItem, Filter, FilterOperator, MessageToast, BusyIndicator, Dialog, Button, VBox) {
	"use strict";

	return Controller.extend("com.arjas.ZSDAnnualSales.controller.ChartView", {
		onInit: function() {
			this._oModel = this.getOwnerComponent().getModel();
			this._oIconTabBar = this.byId("iconTabBar");
			this._oSmartFilterBar = this.byId("smartFilterBar");

			const that = this;
			sap.ui.core.BusyIndicator.show(0);

			this._oModel.metadataLoaded().then(function() {
				that._oSmartFilterBar.attachInitialized(function() {
					that.onSearch();
					setTimeout(() => sap.ui.core.BusyIndicator.hide(), 1000);
				});
			});
		},

		onSearch: function() {
			this._loadMaterialGroupsAndTabs();
		},

		onTabSelect: function(oEvent) {
			const sKey = oEvent.getParameter("key");
			const oTab = this._oIconTabBar.getItems().find(tab => tab.getKey() === sKey);
			if (oTab && !oTab.getContent().length) {
				this._createChartForGroup(sKey, oTab);
			}
		},

		_loadMaterialGroupsAndTabs: function() {
			const that = this;
			BusyIndicator.show(0);
			this._oIconTabBar.removeAllItems();

			// ✅ Whitelisted Material Groups
			const aAllowedGroups = [
				"Z050", "Z051", "Z069", "Z070",
				"Z072", "Z073", "Z074", "Z075",
				"Z077", "Z100", "Z101", "Z102"
			];

			this._oModel.read("/Zsales_Deliv_Plan", {
				urlParameters: {
					$select: "MATL_GROUP,MatlGroupDesc",
					$top: "1000"
				},
				success: function(oData) {
					const mGroupDesc = {};
					
					console.log(oData);

					// ✅ Map available descriptions from backend
					oData.results.forEach(r => {
						if (r.MATL_GROUP && aAllowedGroups.includes(r.MATL_GROUP)) {
							mGroupDesc[r.MATL_GROUP] = r.MatlGroupDesc || "";
						}
					});

					// ✅ Create all tabs — even if group not in OData
					aAllowedGroups.forEach(function(sGroup) {
						const sDesc = mGroupDesc[sGroup] || "";
						const sTitle = sDesc ? `${sDesc} (${sGroup})` : sGroup;

						const oTab = new sap.m.IconTabFilter({
							key: sGroup,
							text: sTitle,
							icon: "sap-icon://product",
							// ✅ Add margin for better spacing
							class: "sapUiSmallMarginEnd"
						});

						that._oIconTabBar.addItem(oTab);
					});

					// Load first tab
					const sFirst = aAllowedGroups[0];
					const oFirstTab = that._oIconTabBar.getItems()[0];
					that._createChartForGroup(sFirst, oFirstTab);

					BusyIndicator.hide();
				},
				error: function() {
					BusyIndicator.hide();
					MessageToast.show("Failed to fetch Material Groups");
				}
			});
		},

		_createChartForGroup: function(sGroup, oTab) {
			const that = this;

			// 🌀 Local BusyDialog instead of global BusyIndicator
			const oBusyDialog = new sap.m.BusyDialog({
				text: "Loading chart data...",
				showCancelButton: false
			});
			oBusyDialog.open();

			const sGroupDesc = oTab.getText().includes("(") ? oTab.getText().split("(")[0].trim() : sGroup;

			this._readDataForChart(sGroup)
				.then(function(aData) {
					// Close BusyDialog once data retrieved
					// (we still also close on renderComplete further down)
					// but close early if no data so user sees the message
					// later renderComplete will be a no-op.
					// NOTE: keep original behavior: close immediately here
					oBusyDialog.close();

					// ✅ Handle case when no data available
                    if (!aData.length) {
                        const oNoDataVBox = new sap.m.VBox({
                            width: "100%",
                            height: "400px",
                            justifyContent: "Center",
                            alignItems: "Center",
                            items: [
                                new sap.m.FlexBox({
                                    direction: "Column",
                                    alignItems: "Center",
                                    justifyContent: "Center",
                                    items: [
                                        new sap.ui.core.Icon({
                                            src: "sap-icon://database",
                                            size: "4rem",
                                            color: "#6a6d70"
                                        }),
                                        new sap.m.Text({
                                            text: "No Data Available",
                                            design: "Bold",
                                            textAlign: "Center",
                                            class: "sapUiTinyMarginTop"
                                        }),
                                        new sap.m.Text({
                                            text: `No records found for Material Group ${sGroup}.`,
                                            textAlign: "Center",
                                            class: "sapUiTinyMarginTop"
                                        }),
                                        new sap.m.Button({
                                            text: "Try Again",
                                            icon: "sap-icon://refresh",
                                            type: "Emphasized",
                                            press: function () {
                                                that._createChartForGroup(sGroup, oTab);
                                            },
                                            class: "sapUiTinyMarginTop"
                                        })
                                    ]
                                })
                            ]
                        });

                        const oNoDataPanel = new sap.m.Panel({
                            backgroundDesign: "Transparent",
                            content: [oNoDataVBox],
                            customData: [
                                new sap.ui.core.CustomData({
                                    key: "style",
                                    value: "background: linear-gradient(180deg, #f9f9f9 0%, #f0f0f0 100%); border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);"
                                })
                            ]
                        });

                        oTab.removeAllContent();
                        oTab.addContent(oNoDataPanel);
                        return;
                    }

					// KPI update
					const totalQuantity = aData.reduce((sum, r) => sum + (r.ABP_PRD_QTY || 0), 0);
					const actualQuantity = aData.reduce((sum, r) => sum + (r.PREINV_QTY || 0), 0);

					const oTotal = that.byId("totalQuantity");
					const oActual = that.byId("actualQuantity");
					if (oTotal) oTotal.setNumber(totalQuantity.toFixed(2));
					if (oActual) oActual.setNumber(actualQuantity.toFixed(2));

					// Chart creation
					const oViz = new sap.viz.ui5.controls.VizFrame({
						width: "100%",
						height: "600px",
						vizType: "column",
						uiConfig: {
							applicationSet: "fiori"
						}
					});

					oViz.setVizProperties({
						title: {
							text: `Sales Plan vs Actual – ${sGroupDesc} (${sGroup})`,
							visible: true
						},
						plotArea: {
							dataLabel: {
								visible: true
							},
							drawingEffect: "glossy"
						},
						legend: {
							visible: true
						},
						valueAxis: {
							title: {
								visible: true,
								text: "Quantity"
							}
						},
						categoryAxis: {
							title: {
								visible: true,
								text: "Calendar Month"
							}
						}
					});

					const oDataset = new sap.viz.ui5.data.FlattenedDataset({
						dimensions: [{
							name: "CALMONTH",
							value: "{CALMONTH}"
						}],
						measures: [{
							name: "Annual Plan",
							value: "{ABP_PRD_QTY}"
						}, {
							name: "Monthly Plan",
							value: "{MONTH_PLAN_QTY}"
						}, {
							name: "Prev. Year Same Month",
							value: "{PREINV_QTY}"
						}, {
							name: "Current Month Actual",
							value: "{CURR_MONTH_QTY}"
						}],
						data: {
							path: "/results"
						}
					});

					const oJsonModel = new sap.ui.model.json.JSONModel({
						results: aData
					});
					oViz.setDataset(oDataset);
					oViz.setModel(oJsonModel);

					oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
						uid: "categoryAxis",
						type: "Dimension",
						values: ["CALMONTH"]
					}));
					oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
						uid: "valueAxis",
						type: "Measure",
						values: ["Annual Plan", "Monthly Plan", "Prev. Year Same Month", "Current Month Actual"]
					}));

					// ----------------------
					// ADD TABLE (keeps everything else unchanged)
					// ----------------------
					const oTable = new sap.m.Table({
						width: "100%",
						growing: true,
						growingScrollToLoad: true,
						alternateRowColors: true,
						columns: [
							new sap.m.Column({
								header: new sap.m.Label({
									text: "Calendar Month"
								})
							}),
							new sap.m.Column({
								header: new sap.m.Label({
									text: "Annual Plan"
								})
							}),
							new sap.m.Column({
								header: new sap.m.Label({
									text: "Monthly Plan"
								})
							}),
							new sap.m.Column({
								header: new sap.m.Label({
									text: "Prev. Year Same Month"
								})
							}),
							new sap.m.Column({
								header: new sap.m.Label({
									text: "Current Month Actual"
								})
							})
						]
					});

					const oTemplate = new sap.m.ColumnListItem({
						cells: [
							new sap.m.Text({
								text: "{CALMONTH}"
							}),
							new sap.m.Text({
								text: "{ABP_PRD_QTY}"
							}),
							new sap.m.Text({
								text: "{MONTH_PLAN_QTY}"
							}),
							new sap.m.Text({
								text: "{PREINV_QTY}"
							}),
							new sap.m.Text({
								text: "{CURR_MONTH_QTY}"
							})
						]
					});

					oTable.bindItems({
						path: "/results",
						template: oTemplate
					});
					oTable.setModel(oJsonModel);

					// Wrap chart and table into a ChartContainer (chart + table toggle)
					const oChartContent = new sap.suite.ui.commons.ChartContainerContent({
						icon: "sap-icon://bar-chart",
						title: "Chart View",
						content: [oViz]
					});

					const oTableContent = new sap.suite.ui.commons.ChartContainerContent({
						icon: "sap-icon://table-view",
						title: "Table View",
						content: [oTable]
					});

					const oChartContainer = new sap.suite.ui.commons.ChartContainer({
						showFullScreen: true,
						autoAdjustHeight: true,
						content: [oChartContent, oTableContent]
					});
					// do not call setSelectedContent (may not exist); ChartContainer will show first content by default

					// Toolbar
					/*const oToolbar = new sap.m.OverflowToolbar({
						content: [
							new sap.m.Title({
								text: `Material Group: ${sGroupDesc} (${sGroup})`
							}),
							new sap.m.ToolbarSpacer(),
							new sap.m.SegmentedButton({
								items: [
									new sap.m.SegmentedButtonItem({
										icon: "sap-icon://full-screen",
										tooltip: "View Full Screen",
										press: function() {
											that._openFullScreen(oChartContainer, `${sGroupDesc} (${sGroup})`);
										}
									}),
									new sap.m.SegmentedButtonItem({
										icon: "sap-icon://legend",
										tooltip: "Toggle Legend",
										press: function() {
											const props = oViz.getVizProperties();
											props.legend = props.legend || {};
											props.legend.visible = !props.legend.visible;
											oViz.setVizProperties(props);
										}
									})
								]
							})
						]
					});*/

					const oVBox = new sap.m.VBox({
						items: [oChartContainer]

					});
					oVBox.addStyleClass("chartContentBox");
					oTab.addContent(oVBox);

					// 🟢 When VizFrame finishes rendering, hide busy dialog safely
					oViz.attachRenderComplete(function() {
						try {
							if (oBusyDialog.isOpen()) oBusyDialog.close();
						} catch (e) {
							/* ignore */
						}
					});
				})
				.catch(function(err) {
					oBusyDialog.close();
					console.error("Chart load failed for", sGroup, err);
					sap.m.MessageToast.show("Error loading chart for " + sGroup);
				});
		},

		_readDataForChart: function(sGroup) {
			const that = this;
			return new Promise(function(resolve, reject) {
				const aFilters = that._getSmartFilterBarFilters();
				aFilters.push(new Filter("MATL_GROUP", FilterOperator.EQ, sGroup));

				that._oModel.read("/Zsales_Deliv_Plan", {
					filters: aFilters,
					urlParameters: {
						$select: "CALMONTH,ABP_PRD_QTY,MONTH_PLAN_QTY,PREINV_QTY,CURR_MONTH_QTY,MATL_GROUP",
						$orderby: "CALMONTH"
					},
					success: function(oData) {
						const results = oData.results.map(row => ({
							CALMONTH: row.CALMONTH,
							ABP_PRD_QTY: +row.ABP_PRD_QTY || 0,
							MONTH_PLAN_QTY: +row.MONTH_PLAN_QTY || 0,
							PREINV_QTY: +row.PREINV_QTY || 0,
							CURR_MONTH_QTY: +row.CURR_MONTH_QTY || 0
						}));
						resolve(results);
					},
					error: reject
				});
			});
		},

		_getSmartFilterBarFilters: function() {
			const oSFB = this._oSmartFilterBar;
			if (!oSFB) return [];

			const oData = oSFB.getFilterData();
			const aFilters = [];

			if (oData.CALMONTH && oData.CALMONTH.ranges && oData.CALMONTH.ranges.length) {
				const r = oData.CALMONTH.ranges[0];
				if (r.operation === "BT") {
					aFilters.push(new Filter("CALMONTH", FilterOperator.BT, r.value1, r.value2));
				} else {
					aFilters.push(new Filter("CALMONTH", FilterOperator.EQ, r.value1));
				}
			}

			return aFilters;
		},

		_openFullScreen: function(oViz, sGroup) {
			const oDialog = new Dialog({
				contentWidth: "95%",
				contentHeight: "90%",
				resizable: true,
				draggable: true,
				title: `Full Screen - ${sGroup}`,
				content: [oViz.clone()],
				buttons: [
					new Button({
						text: "Close",
						press: function() {
							oDialog.close();
							oDialog.destroy();
						}
					})
				],
				afterClose: function() {
					oDialog.destroy();
				}
			});

			oDialog.open();
		}
	});
});