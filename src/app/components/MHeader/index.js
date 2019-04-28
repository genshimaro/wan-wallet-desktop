import React, { Component } from 'react';
import { Button, Row, Col } from 'antd';
import { observer, inject } from 'mobx-react';
import { Icon } from 'antd';

import './index.less';

@inject(stores => ({
  pageTitle: stores.session.pageTitle,
  getMnemonic: (ret) => stores.session.getMnemonic(ret)
}))

@observer
class MHeader extends Component {
  logOut = () =>{
    this.props.getMnemonic(false)
  }

  render () {
    const { pageTitle } = this.props;

    return (
      <div className="header">
        <Row className="header-top">
            <Col span={6} className="title">
              <em className = "comLine"></em><span>{ pageTitle }</span>
            </Col>
            <Col span={18} className="user">
              {/* <Button type="primary"  onClick={this.logOut}>Log Out</Button> */}
              <div className="log">
                <Icon className="logOutIco" type="poweroff" />
                <span onClick={this.logOut} className="logOut">Log Out</span>
              </div>
            </Col>
        </Row>
      </div>
    );
  }
}

export default MHeader;
