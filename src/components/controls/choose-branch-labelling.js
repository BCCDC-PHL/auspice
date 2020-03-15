import React from "react";
import { connect } from "react-redux";
import Select from "react-select";
import { CHANGE_BRANCH_LABEL } from "../../actions/types";
import { SidebarSubtitle } from "./styles";
import { controlsWidth } from "../../util/globals";
import { withTranslation } from 'react-i18next';

@connect((state) => ({
  selected: state.controls.selectedBranchLabel,
  available: state.tree.availableBranchLabels
}))
class ChooseBranchLabelling extends React.Component {
  constructor(props) {
    super(props);
    this.change = (value) => {this.props.dispatch({type: CHANGE_BRANCH_LABEL, value: value.value});};
  }
  render() {
    const { t, i18n } = this.props;
    return (
      <div style={{paddingTop: 5}}>
        <SidebarSubtitle>
          {t("Branch Labels")}
        </SidebarSubtitle>
        <div style={{width: controlsWidth, fontSize: 14}}>
          <Select
            value={this.props.selected}
            options={this.props.available.map((x) => ({value: x, label: x}))}
            clearable={false}
            searchable={false}
            multi={false}
            onChange={this.change}
          />
        </div>
      </div>
    );
  }
}

const WithTranslation = withTranslation()(ChooseBranchLabelling)

export default WithTranslation;
