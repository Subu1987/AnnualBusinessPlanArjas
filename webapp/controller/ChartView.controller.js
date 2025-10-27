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
], function (Controller, VizFrame, FlattenedDataset, FeedItem, Filter, FilterOperator, MessageToast, BusyIndicator, Dialog, Button, VBox) {
    "use strict";

    return Controller.extend("com.arjas.zsdannual.controller.ChartView", {
        onInit: function () {
            this._oModel = this.getOwnerComponent().getModel();
            this._oIconTabBar = this.byId("iconTabBar");
            this._oSmartFilterBar = this.byId("smartFilterBar");

            const that = this;
            sap.ui.core.BusyIndicator.show(0);

            this._oModel.metadataLoaded().then(function () {
                that._oSmartFilterBar.attachInitialized(function () {
                    that.onSearch();
                    setTimeout(() => sap.ui.core.BusyIndicator.hide(), 1000);
                });
            });
        },

        onSearch: function () {
            this._loadMaterialGroupsAndTabs();
        },

        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            const oTab = this._oIconTabBar.getItems().find(tab => tab.getKey() === sKey);
            if (oTab && !oTab.getContent().length) {
                this._createChartForGroup(sKey, oTab);
            }
        },

        _loadMaterialGroupsAndTabs: function () {
            const that = this;
            BusyIndicator.show(0);
            this._oIconTabBar.removeAllItems();

            this._oModel.read("/Zsales_Deliv_Plan", {
                urlParameters: { $select: "MATL_GROUP,MatlGroupDesc", $top: "1000" },
                success: function (oData) {
                    const aGroupsMap = new Map();

                    oData.results.forEach(r => {
                        if (r.MATL_GROUP && !aGroupsMap.has(r.MATL_GROUP)) {
                            aGroupsMap.set(r.MATL_GROUP, r.MatlGroupDesc || "");
                        }
                    });

                    if (!aGroupsMap.size) {
                        BusyIndicator.hide();
                        MessageToast.show("No Material Groups found");
                        return;
                    }

                    aGroupsMap.forEach(function (sDesc, sGroup) {
                        const sTitle = sDesc ? `${sDesc} (${sGroup})` : sGroup;
                        const oTab = new sap.m.IconTabFilter({
                            key: sGroup,
                            text: sTitle,
                            icon: "sap-icon://product"
                        });
                        that._oIconTabBar.addItem(oTab);
                    });

                    const sFirst = Array.from(aGroupsMap.keys())[0];
                    const oFirstTab = that._oIconTabBar.getItems()[0];
                    that._createChartForGroup(sFirst, oFirstTab);

                    BusyIndicator.hide();
                },
                error: function () {
                    BusyIndicator.hide();
                    MessageToast.show("Failed to fetch Material Groups");
                }
            });
        },

        _createChartForGroup: function (sGroup, oTab) {
            const that = this;
            BusyIndicator.show(0);

            const sGroupDesc = oTab.getText().includes("(")
                ? oTab.getText().split("(")[0].trim()
                : sGroup;

            this._readDataForChart(sGroup).then(function (aData) {
                BusyIndicator.hide();

                // 🔹 Calculate KPI Summary values
                const totalQuantity = aData.reduce((sum, r) => sum + (r.ABP_PRD_QTY || 0), 0);
                const actualQuantity = aData.reduce((sum, r) => sum + (r.PREINV_QTY || 0), 0);

                // ✅ Update KPI fields in XML
                const oTotal = that.byId("totalQuantity");
                const oActual = that.byId("actualQuantity");
                if (oTotal) oTotal.setNumber(totalQuantity.toFixed(2));
                if (oActual) oActual.setNumber(actualQuantity.toFixed(2));

                const oViz = new VizFrame(that.createId("viz_" + sGroup + "_" + Date.now()), {
                    width: "100%",
                    height: "600px",
                    vizType: "column",
                    uiConfig: { applicationSet: "fiori" }
                });

                oViz.setVizProperties({
                    title: { text: `Sales Plan vs Actual – ${sGroupDesc} (${sGroup})`, visible: true },
                    plotArea: { dataLabel: { visible: true }, drawingEffect: "glossy" },
                    legend: { visible: true },
                    interaction: { selectability: { mode: "EXCLUSIVE" } },
                    valueAxis: { title: { visible: true, text: "Quantity" } },
                    categoryAxis: { title: { visible: true, text: "Calendar Month" } }
                });

                const oDataset = new FlattenedDataset({
                    dimensions: [{ name: "CALMONTH", value: "{CALMONTH}" }],
                    measures: [
                        { name: "Annual Plan", value: "{ABP_PRD_QTY}" },
                        { name: "Monthly Plan", value: "{MONTH_PLAN_QTY}" },
                        { name: "Prev. Year Same Month", value: "{PREINV_QTY}" },
                        { name: "Current Month Actual", value: "{CURR_MONTH_QTY}" }
                    ],
                    data: { path: "/results" }
                });

                const oJsonModel = new sap.ui.model.json.JSONModel({ results: aData });
                oViz.setDataset(oDataset);
                oViz.setModel(oJsonModel);

                oViz.addFeed(new FeedItem({ uid: "categoryAxis", type: "Dimension", values: ["CALMONTH"] }));
                oViz.addFeed(new FeedItem({
                    uid: "valueAxis",
                    type: "Measure",
                    values: ["Annual Plan", "Monthly Plan", "Prev. Year Same Month", "Current Month Actual"]
                }));

                const oToolbar = new sap.m.OverflowToolbar({
                    content: [
                        new sap.m.Title({ text: `Material Group: ${sGroupDesc} (${sGroup})` }),
                        new sap.m.ToolbarSpacer(),
                        new Button({
                            icon: "sap-icon://full-screen",
                            tooltip: "View Full Screen",
                            press: function () { that._openFullScreen(oViz, `${sGroupDesc} (${sGroup})`); }
                        }),
                        new Button({
                            icon: "sap-icon://legend",
                            tooltip: "Toggle Legend",
                            press: function () {
                                const props = oViz.getVizProperties();
                                props.legend.visible = !props.legend.visible;
                                oViz.setVizProperties(props);
                            }
                        })
                    ]
                });

                const oVBox = new VBox({ items: [oToolbar, oViz] });
                oTab.removeAllContent();
                oTab.addContent(oVBox);
            }).catch(function (err) {
                BusyIndicator.hide();
                console.error("Chart load failed for", sGroup, err);
                MessageToast.show("Error loading chart for " + sGroup);
            });
        },

        _readDataForChart: function (sGroup) {
            const that = this;
            return new Promise(function (resolve, reject) {
                const aFilters = that._getSmartFilterBarFilters();
                aFilters.push(new Filter("MATL_GROUP", FilterOperator.EQ, sGroup));

                that._oModel.read("/Zsales_Deliv_Plan", {
                    filters: aFilters,
                    urlParameters: {
                        $select: "CALMONTH,ABP_PRD_QTY,MONTH_PLAN_QTY,PREINV_QTY,CURR_MONTH_QTY,MATL_GROUP",
                        $orderby: "CALMONTH"
                    },
                    success: function (oData) {
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

        _getSmartFilterBarFilters: function () {
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

        _openFullScreen: function (oViz, sGroup) {
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
                        press: function () {
                            oDialog.close();
                            oDialog.destroy();
                        }
                    })
                ],
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.open();
        }
    });
});
